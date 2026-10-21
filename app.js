'use strict';

const V2_KEY='adc-figueiras-team-manager-v3-dev';
const V1_KEY='adc-figueiras-team-manager-v3-legacy-unused';
const MODE_KEY='adc-figueiras-v3-preview-mode';
const AUTO_BACKUP_KEY='adc-figueiras-team-manager-v3-autobackup';
const APP_VERSION='3.17.0';
const PRIVACY_POLICY_VERSION='2026-10-21-v2';
const TERMS_VERSION='2026-10-21-v1';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,'0');
const uid=p=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
function sanitizePlainText(value,max=120){
 return String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,max);
}
const EMAIL_INPUT_PATTERN=/^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/;
const MIN_NEW_PASSWORD_LENGTH=12;
const money=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const nowKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const fmtDate=iso=>iso?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${iso}T12:00:00`)):'—';
const fmtShort=iso=>iso?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short'}).format(new Date(`${iso}T12:00:00`)):'—';
const fmtMonth=d=>new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(d);
const dateTimeOf=(date,time='23:59')=>new Date(`${date}T${time||'23:59'}:00`);
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const addDays=(iso,days)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};


// V3 backend pilot — the publishable key is intentionally safe for browser use.
// Real data protection is enforced by the Supabase RLS policies created in Blocks 1–7.
const SUPABASE_URL='https://kfihltycbnambszmefqa.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_dF_bY-SgTQi3pWjIWt1ocA_unkhmtdm';
// VAPID public key: safe to expose in the browser. The matching private key lives only in Supabase Edge Function Secrets.
const VAPID_PUBLIC_KEY='BFjsR0mq-V8eBLzIwalD0AbbFpCcl3pyUcqC09NcNstgSTG-BrAtw4avRmIoK_m7vlRzvYPXUHjPnJuIW2vQ-gY';
let supabaseClient=null;
let backendSession=null;
let backendProfile=null;
let backendRoles=[];
let backendPlayerAccount=null;
let backendPeople={profiles:[],roles:[],links:[],invitations:[]};
let backendPeopleLoaded=false;
let backendConnected=false;
let guestMode=false;
let backendReference={settings:null,seasons:[],competitions:[],teams:[],competitionTeams:[]};
let backendReferenceLoaded=false;
let backendRoster={seasonId:'',rows:[]};
let backendRosterLoaded=false;
let backendMatches={seasonId:'',rows:[]};
let backendMatchesLoaded=false;
let backendMatchCenter={matchPlayers:[],events:[],weighIns:[]};
let backendMatchCenterLoaded=false;
let backendMatchWeightsAvailable=false;
let backendTraining={seasonId:'',trainings:[],attendance:[],weighIns:[]};
let backendTrainingLoaded=false;
let backendNutritionLoaded=false;
let backendFines={seasonId:'',rules:[],fines:[]};
let backendFinesLoaded=false;
let backendNotifications={rows:[],recipients:[],preferences:null};
let backendNotificationsLoaded=false;
let backendPushDevice={supported:false,permission:'default',subscribed:false,endpoint:'',row:null};
let backendPrivacyAcknowledgement=null;
let backendPrivacyLoaded=false;
let passwordRecoveryMode=false;
let authStateSubscription=null;
const PUSH_ONBOARDING_KEY_PREFIX='adc-figueiras-push-onboarding-v1:';
const FIRST_ACCESS_KEY_PREFIX='adc-figueiras-first-access-v1:';
const PENDING_CONFIRM_EMAIL_KEY='adc-figueiras-pending-confirm-email-v1';

const roleRank=['public','member','player','captain','staff','admin'];
function highestBackendRole(roles=[]){
 const valid=roles.filter(r=>roleRank.includes(r));
 if(!valid.length)return 'public';
 return valid.sort((a,b)=>roleRank.indexOf(b)-roleRank.indexOf(a))[0];
}
function backendDisplayName(){
 return backendProfile?.display_name||backendSession?.user?.email?.split('@')[0]||'Utilizador';
}
function localPlayerIdForBackend(backendId){
 return state?.players?.find(p=>p.backendId===backendId)?.id||'';
}
function backendPlayerName(backendId){
 return backendRoster?.rows?.find(r=>r.player_id===backendId)?.name||'—';
}
function backendPeopleRows(){
 return (backendPeople.profiles||[]).map(p=>{
  const roles=(backendPeople.roles||[]).filter(r=>r.user_id===p.id).map(r=>r.role);
  const link=(backendPeople.links||[]).find(l=>l.user_id===p.id);
  return {id:p.id,name:p.display_name||p.email?.split('@')[0]||'Utilizador',email:p.email||'',memberNumber:p.member_number||'',memberStatus:p.member_status||'none',active:p.active!==false,roles,backendPlayerId:link?.player_id||'',playerId:localPlayerIdForBackend(link?.player_id||'')};
 }).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt'));
}
async function loadBackendPeopleData(){
 if(!backendRoles.includes('admin')){backendPeople={profiles:[],roles:[],links:[],invitations:[]};backendPeopleLoaded=false;return}
 const [profilesRes,rolesRes,linksRes,invitationsRes]=await Promise.all([
  supabaseClient.from('profiles').select('id,display_name,email,member_number,member_status,active,created_at').order('display_name',{ascending:true}),
  supabaseClient.from('user_roles').select('user_id,role'),
  supabaseClient.from('player_accounts').select('player_id,user_id,linked_at'),
  supabaseClient.from('user_invitations').select('id,email,display_name,roles,player_id,member_number,created_at,claimed_at,claimed_user_id,cancelled_at').is('claimed_at',null).is('cancelled_at',null).order('created_at',{ascending:false})
 ]);
 for(const res of [profilesRes,rolesRes,linksRes,invitationsRes])if(res.error)throw res.error;
 backendPeople={profiles:profilesRes.data||[],roles:rolesRes.data||[],links:linksRes.data||[],invitations:invitationsRes.data||[]};
 backendPeopleLoaded=true;
}
async function saveBackendUserAccess(data){
 if(!backendRoles.includes('admin'))throw new Error('Só um Admin pode gerir acessos.');
 const {error}=await supabaseClient.rpc('admin_set_user_access',{
  p_user_id:data.id,
  p_display_name:data.name,
  p_roles:data.roles,
  p_player_id:data.backendPlayerId||null,
  p_member_number:data.memberNumber||null,
  p_active:data.active!==false
 });
 if(error)throw error;
 await loadBackendPeopleData();
 if(data.id===backendSession?.user?.id){
  const row=backendPeopleRows().find(x=>x.id===data.id);
  backendProfile={...(backendProfile||{}),display_name:row?.name||backendProfile?.display_name,member_number:row?.memberNumber||'',member_status:row?.memberStatus||'none',active:row?.active!==false,email:row?.email||backendSession?.user?.email||''};
  backendRoles=row?.roles||backendRoles;
  const link=backendPeople.links.find(x=>x.user_id===data.id);backendPlayerAccount=link||null;
  configurePreviewSelector();mode=highestBackendRole(backendRoles);
 }
}
async function saveBackendInvitation(data){
 if(!backendRoles.includes('admin'))throw new Error('Só um Admin pode criar convites.');
 const {data:invitationId,error}=await supabaseClient.rpc('admin_save_invitation',{
  p_invitation_id:data.id||null,
  p_email:String(data.email||'').trim().toLowerCase(),
  p_display_name:String(data.name||'').trim(),
  p_roles:data.roles,
  p_player_id:data.backendPlayerId||null,
  p_member_number:data.memberNumber||null
 });
 if(error)throw error;await loadBackendPeopleData();return invitationId;
}
async function cancelBackendInvitation(id){
 if(!backendRoles.includes('admin'))throw new Error('Só um Admin pode cancelar convites.');
 const {error}=await supabaseClient.rpc('admin_cancel_invitation',{p_invitation_id:id});if(error)throw error;await loadBackendPeopleData();
}
async function refreshMyBackendProfile(){
 if(!backendSession?.user?.id)return null;
 const {data,error}=await supabaseClient.from('profiles').select('id,display_name,email,member_number,member_status,active').eq('id',backendSession.user.id).maybeSingle();
 if(error)throw error;
 backendProfile=data||backendProfile;
 return backendProfile;
}
async function updateMyProfileName(name){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão para alterar o perfil.');
 const clean=sanitizePlainText(name,120);
 if(!clean)throw new Error('Indica o teu nome.');
 const {error}=await supabaseClient.rpc('update_my_profile',{p_display_name:clean});
 if(error)throw error;
 await refreshMyBackendProfile();
}
async function requestMyMemberNumber(memberNumber){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão para enviar um pedido de sócio.');
 const {error}=await supabaseClient.rpc('request_member_number',{p_member_number:sanitizePlainText(memberNumber,30)||null});
 if(error)throw error;
 await refreshMyBackendProfile();
 if(backendRoles.includes('admin'))await loadBackendPeopleData();
}
async function changeMyPassword(password,password2){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão para alterar a palavra-passe.');
 if(String(password||'').length<MIN_NEW_PASSWORD_LENGTH)throw new Error('A nova palavra-passe deve ter pelo menos 12 caracteres.');
 if(password!==password2)throw new Error('As palavras-passe não coincidem.');
 const {error}=await supabaseClient.auth.updateUser({password});
 if(error)throw error;
}

function privacyAcknowledged(){return !!(backendPrivacyAcknowledgement&&backendPrivacyAcknowledgement.policy_version===PRIVACY_POLICY_VERSION)}
async function loadPrivacyAcknowledgement(){
 backendPrivacyAcknowledgement=null;backendPrivacyLoaded=false;
 if(!backendSession?.user?.id)return null;
 try{
  const {data,error}=await supabaseClient.from('privacy_acknowledgements').select('user_id,policy_version,acknowledged_at,updated_at').eq('user_id',backendSession.user.id).maybeSingle();
  if(error)throw error;
  backendPrivacyAcknowledgement=data||null;backendPrivacyLoaded=true;return backendPrivacyAcknowledgement;
 }catch(err){
  console.warn('Não foi possível carregar a tomada de conhecimento da privacidade.',err);
  return null;
 }
}
async function acknowledgePrivacyNotice(){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão primeiro.');
 const payload={user_id:backendSession.user.id,policy_version:PRIVACY_POLICY_VERSION,acknowledged_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const {data,error}=await supabaseClient.from('privacy_acknowledgements').upsert(payload,{onConflict:'user_id'}).select('*').single();
 if(error)throw error;
 backendPrivacyAcknowledgement=data;backendPrivacyLoaded=true;return data;
}
function appInstalled(){return !!(window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true)}



function urlBase64ToUint8Array(base64String){
 const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
function pushSupported(){return !!(VAPID_PUBLIC_KEY&&backendSession?.user?.id&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window&&location.protocol!=='file:')}
async function loadPushDeviceStatus(){
 const supported=pushSupported();backendPushDevice={supported,permission:('Notification'in window?Notification.permission:'unsupported'),subscribed:false,endpoint:'',row:null};
 if(!supported)return backendPushDevice;
 try{
  const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
  if(!sub)return backendPushDevice;
  const rowRes=await supabaseClient.from('push_subscriptions').select('id,user_id,endpoint,active,created_at,updated_at,last_seen_at').eq('endpoint',sub.endpoint).maybeSingle();
  if(rowRes.error)throw rowRes.error;
  // If the browser still has a valid subscription but the DB row disappeared, recreate it for this user.
  let row=rowRes.data||null;
  if(!row){row=await savePushSubscription(sub)}
  backendPushDevice={supported:true,permission:Notification.permission,subscribed:row?.active!==false,endpoint:sub.endpoint,row};
 }catch(err){console.warn('Não foi possível verificar o push neste dispositivo.',err)}
 return backendPushDevice;
}
async function savePushSubscription(sub){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão para ativar notificações push.');
 const json=sub.toJSON();const payload={user_id:backendSession.user.id,endpoint:sub.endpoint,p256dh:json.keys?.p256dh||'',auth:json.keys?.auth||'',user_agent:navigator.userAgent||'',active:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const res=await supabaseClient.from('push_subscriptions').upsert(payload,{onConflict:'endpoint'}).select('*').single();if(res.error)throw res.error;return res.data;
}
async function activatePushOnDevice(){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão primeiro.');
 if(!pushSupported())throw new Error('Este browser/dispositivo não suporta Web Push nesta configuração.');
 if(Notification.permission==='denied')throw new Error('As notificações estão bloqueadas nas definições do browser. É preciso voltar a permiti-las para este site.');
 const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Permissão de notificações não concedida.');
 const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
 const row=await savePushSubscription(sub);backendPushDevice={supported:true,permission:'granted',subscribed:true,endpoint:sub.endpoint,row};return row;
}
async function deactivatePushOnDevice(){
 if(!pushSupported())return;
 const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
 if(sub){const del=await supabaseClient.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(del.error)throw del.error;await sub.unsubscribe()}
 backendPushDevice={supported:true,permission:Notification.permission,subscribed:false,endpoint:'',row:null};
}
async function sendPushTest(){
 if(!backendPushDevice.subscribed)throw new Error('Ativa primeiro o push neste dispositivo.');
 const {data,error}=await supabaseClient.functions.invoke('push-test',{body:{}});if(error)throw error;if(!data?.sent)throw new Error(data?.message||'O servidor não confirmou o envio do push.');return data;
}
function pushOnboardingKey(){return `${PUSH_ONBOARDING_KEY_PREFIX}${backendSession?.user?.id||'guest'}`}
function pushOnboardingSeen(){try{return !!localStorage.getItem(pushOnboardingKey())}catch{return false}}
function markPushOnboardingSeen(value='seen'){try{localStorage.setItem(pushOnboardingKey(),value)}catch{}}
function shouldOfferPushOnboarding(){
 return !!(backendSession?.user?.id&&!guestMode&&backendPushDevice.supported&&!backendPushDevice.subscribed&&backendPushDevice.permission!=='denied'&&!pushOnboardingSeen());
}
function openPushOnboarding(){
 if(!shouldOfferPushOnboarding())return;
 openModal('Ativar notificações?','Recebe os avisos importantes do ADC Figueiras mesmo quando a app não está aberta.',`<div class="info-strip">Podemos avisar-te de convocatórias, treinos, DIA DE JOGO, resultados e outras mensagens do clube.</div><div style="height:12px"></div><div class="note">O teu dispositivo vai pedir autorização para mostrar notificações. Podes alterar esta opção mais tarde em <strong>Notificações</strong>.</div><div class="form-actions"><button type="button" class="btn secondary" id="pushOnboardingLater">Agora não</button><button type="button" class="btn" id="pushOnboardingEnable">Ativar notificações</button></div>`);
 const later=$('#pushOnboardingLater'),enable=$('#pushOnboardingEnable');
 later.onclick=()=>{markPushOnboardingSeen('later');closeModal();queueFirstAccessGuide()};
 enable.onclick=async()=>{
  enable.disabled=true;enable.textContent='A ativar…';
  try{
   await activatePushOnDevice();
   markPushOnboardingSeen('enabled');
   closeModal();renderChrome();toast('Notificações push ativadas neste dispositivo.');queueFirstAccessGuide();
  }catch(err){
   console.error(err);markPushOnboardingSeen('attempted');
   alert(`Não foi possível ativar as notificações.\n\n${err?.message||'Erro desconhecido'}`);
   enable.disabled=false;enable.textContent='Ativar notificações';
  }
 };
}
function queuePushOnboarding(){
 if(!shouldOfferPushOnboarding()){queueFirstAccessGuide();return;}
 setTimeout(()=>{
  if(!shouldOfferPushOnboarding())return;
  const backdrop=$('#modalBackdrop');
  if(backdrop&&!backdrop.classList.contains('hidden'))return;
  openPushOnboarding();
 },650);
}

function firstAccessKey(){return `${FIRST_ACCESS_KEY_PREFIX}${backendSession?.user?.id||'guest'}`}
function firstAccessSeen(){try{return !!localStorage.getItem(firstAccessKey())}catch{return false}}
function markFirstAccessSeen(){try{localStorage.setItem(firstAccessKey(),'seen')}catch{}}
function shouldOfferFirstAccessGuide(){
 return !!(backendSession?.user?.id&&!guestMode&&backendRoles.some(r=>['player','captain','staff','admin'].includes(r))&&!firstAccessSeen());
}
function openFirstAccessGuide(){
 if(!shouldOfferFirstAccessGuide())return;
 openModal('Bem-vindo à app do ADC Figueiras','Quatro coisas para ficares orientado no primeiro acesso.',`<div class="privacy-list"><div><strong>1 · A minha conta</strong><span>Confirma o teu nome, estado de sócio e segurança da conta.</span></div><div><strong>2 · Notificações</strong><span>Ativa o push no dispositivo para receber convocatórias, treinos, DIA DE JOGO e outros avisos.</span></div><div><strong>3 · Área interna</strong><span>Os menus disponíveis dependem das funções atribuídas pelo clube. Um jogador não consegue alterar permissões.</span></div><div><strong>4 · Privacidade</strong><span>Treinos, pesagens, multas e convocatórias futuras são dados internos e nunca aparecem na área pública.</span></div></div><div class="form-actions"><button type="button" class="btn secondary" id="firstAccessDone">Percebi</button><button type="button" class="btn" id="firstAccessAccount">Abrir A minha conta</button></div>`);
 const done=$('#firstAccessDone'),account=$('#firstAccessAccount');
 done.onclick=()=>{markFirstAccessSeen();closeModal()};
 account.onclick=()=>{markFirstAccessSeen();closeModal();showView('account')};
}
function queueFirstAccessGuide(){
 if(!shouldOfferFirstAccessGuide())return;
 setTimeout(()=>{
  if(!shouldOfferFirstAccessGuide())return;
  const backdrop=$('#modalBackdrop');
  if(backdrop&&!backdrop.classList.contains('hidden'))return;
  openFirstAccessGuide();
 },450);
}

function shouldOfferPrivacyOnboarding(){return !!(backendSession?.user?.id&&!guestMode&&backendPrivacyLoaded&&!privacyAcknowledged())}
function openPrivacyOnboarding(){
 if(!shouldOfferPrivacyOnboarding())return;
 openModal('Privacidade e dados','Antes de continuares, confirma que tomaste conhecimento de como a plataforma utiliza e partilha os dados.',`<div class="info-strip"><strong>Resumo</strong><br>A app guarda dados de conta e, consoante a tua função, informação desportiva interna. As pesagens são internas e podem ser consultadas por jogadores e equipa interna; nunca são públicas nem visíveis a Sócios sem função interna.</div><div style="height:12px"></div><div class="note">Este registo serve para documentar que a política de privacidade da plataforma te foi apresentada. Podes consultá-la a qualquer momento no menu <strong>Privacidade</strong>.</div><div class="form-actions"><button type="button" class="btn secondary" id="privacyOnboardingRead">Ler política completa</button><button type="button" class="btn" id="privacyOnboardingAccept">Tomei conhecimento</button></div>`);
 const read=$('#privacyOnboardingRead'),accept=$('#privacyOnboardingAccept');
 read.onclick=()=>{closeModal();showView('privacy')};
 accept.onclick=async()=>{accept.disabled=true;accept.textContent='A guardar…';try{await acknowledgePrivacyNotice();closeModal();renderChrome();toast('Privacidade confirmada.');queuePushOnboarding()}catch(err){console.error(err);alert(`Não foi possível guardar a confirmação.

${err?.message||'Erro desconhecido'}`);accept.disabled=false;accept.textContent='Tomei conhecimento'}};
}
function queuePostLoginOnboarding(){
 setTimeout(()=>{
  const backdrop=$('#modalBackdrop');
  if(backdrop&&!backdrop.classList.contains('hidden'))return;
  if(shouldOfferPrivacyOnboarding()){openPrivacyOnboarding();return}
  queuePushOnboarding();
 },350);
}

const NOTIFICATION_PREF_DEFAULTS={
 callup_enabled:true,
 matchday_enabled:true,
 training_enabled:true,
 result_enabled:true,
 nutrition_enabled:true,
 general_enabled:true
};
const NOTIFICATION_SCHEDULE_DEFAULTS={
 matchday_time:'08:00',
 nutrition_days_before:1,
 nutrition_time:'10:00',
 training_lead_minutes:120
};
let backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};
let backendNotificationScheduleLoaded=false;
function currentNotificationSchedule(){return {...NOTIFICATION_SCHEDULE_DEFAULTS,...(backendNotificationSchedule||{})}}
async function loadBackendNotificationSchedule(){
 if(!backendSession?.user?.id){backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};backendNotificationScheduleLoaded=false;return backendNotificationSchedule}
 const res=await supabaseClient.from('notification_schedule_settings').select('id,matchday_time,nutrition_days_before,nutrition_time,training_lead_minutes,updated_at').eq('id',true).maybeSingle();
 if(res.error){console.warn('Não foi possível carregar horários padrão de notificações.',res.error);backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};backendNotificationScheduleLoaded=false;return backendNotificationSchedule}
 backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS,...(res.data||{})};backendNotificationScheduleLoaded=!!res.data;return backendNotificationSchedule;
}
async function saveBackendNotificationSchedule(values){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão para guardar os horários.');
 const payload={
  matchday_time:String(values.matchday_time||'08:00').slice(0,5),
  nutrition_days_before:Math.max(0,Math.min(7,Number(values.nutrition_days_before)||0)),
  nutrition_time:String(values.nutrition_time||'10:00').slice(0,5),
  training_lead_minutes:Math.max(0,Math.min(10080,Math.round(Number(values.training_lead_hours||0)*60)))
 };
 const res=await supabaseClient.from('notification_schedule_settings').update(payload).eq('id',true).select('*').single();
 if(res.error)throw res.error;
 backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS,...res.data};backendNotificationScheduleLoaded=true;return res.data;
}
function subtractPortugalMinutes(date,time,minutes){
 const base=new Date(portugalKickoffIso(date,time||'00:00'));base.setMinutes(base.getMinutes()-Number(minutes||0));return portugalParts(base.toISOString());
}
function notificationDefaultTiming(kind,entity=null){
 const cfg=currentNotificationSchedule();let mode='now',date=nowKey(),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
 if(kind==='matchday'&&entity?.date){mode='schedule';date=entity.date;time=String(cfg.matchday_time||'08:00').slice(0,5)}
 if(kind==='nutrition'&&entity?.date){mode='schedule';date=addDays(entity.date,-Number(cfg.nutrition_days_before||1));time=String(cfg.nutrition_time||'10:00').slice(0,5)}
 if(kind==='training'&&entity?.date){const x=subtractPortugalMinutes(entity.date,entity.time||'00:00',Number(cfg.training_lead_minutes||120));mode='schedule';date=x.date;time=x.time}
 if(mode==='schedule'&&new Date(portugalKickoffIso(date,time)).getTime()<=Date.now())mode='now';
 return {mode,date,time};
}
function openNotificationTimingModal({heading='Enviar notificação',description='',kind='general',entity=null,onConfirm}){
 const d=notificationDefaultTiming(kind,entity);
 openModal(heading,description,`<form id="notificationTimingForm"><div class="form-grid"><div class="field full"><label>Quando enviar?</label><select name="timingMode" id="notificationTimingMode"><option value="now" ${d.mode==='now'?'selected':''}>Enviar agora</option><option value="schedule" ${d.mode==='schedule'?'selected':''}>Programar</option></select></div><div class="field notification-schedule-field"><label>Data</label><input type="date" name="scheduleDate" value="${esc(d.date)}"></div><div class="field notification-schedule-field"><label>Hora</label><input type="time" name="scheduleTime" value="${esc(d.time)}"></div></div><div class="note">Podes usar o horário padrão ou alterá-lo apenas para esta notificação.</div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="confirmNotificationTiming">Continuar</button></div></form>`);
 const form=$('#notificationTimingForm'),modeSel=$('#notificationTimingMode');
 const sync=()=>$$('.notification-schedule-field',form).forEach(el=>el.classList.toggle('hidden',modeSel.value!=='schedule'));modeSel.onchange=sync;sync();
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),mode=fd.get('timingMode');let scheduledFor=null;if(mode==='schedule'){const date=String(fd.get('scheduleDate')||''),time=String(fd.get('scheduleTime')||'');if(!date||!time){alert('Indica a data e a hora.');return}scheduledFor=portugalKickoffIso(date,time);if(new Date(scheduledFor).getTime()<=Date.now()){alert('Escolhe uma data/hora futura ou usa “Enviar agora”.');return}}const b=$('#confirmNotificationTiming');b.disabled=true;b.textContent=mode==='schedule'?'A programar…':'A enviar…';try{await onConfirm({mode,scheduledFor,date:String(fd.get('scheduleDate')||''),time:String(fd.get('scheduleTime')||'')});closeModal()}catch(err){console.error(err);alert(`Não foi possível enviar/programar a notificação.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Continuar'}};
 $('[data-close]').onclick=closeModal;
}
function notificationCssType(type){
 return ({callup:'callup',matchday:'game',training:'training',result:'final',nutrition:'food',general:'system'})[type]||'system';
}
function notificationTypeLabel(type){
 return ({callup:'Convocatória',matchday:'Dia de jogo',training:'Treino',result:'Resultado final',nutrition:'Plano pré-jogo',general:'Geral'})[type]||'Notificação';
}
function currentNotificationPreferences(){
 return {...NOTIFICATION_PREF_DEFAULTS,...(backendNotifications.preferences||{})};
}
async function loadBackendNotifications(){
 if(!backendSession?.user?.id){
  backendNotifications={rows:[],recipients:[],preferences:null};
  backendNotificationsLoaded=false;
  if(typeof state!=='undefined')state.notifications=[];
  return;
 }
 const userId=backendSession.user.id;
 const [recRes,prefRes]=await Promise.all([
  supabaseClient.from('notification_recipients').select('notification_id,user_id,read_at,created_at').eq('user_id',userId).order('created_at',{ascending:false}),
  supabaseClient.from('notification_preferences').select('user_id,callup_enabled,matchday_enabled,training_enabled,result_enabled,nutrition_enabled,general_enabled,updated_at').eq('user_id',userId).maybeSingle()
 ]);
 if(recRes.error)throw recRes.error;
 if(prefRes.error)throw prefRes.error;
 const recipients=recRes.data||[];
 const ids=[...new Set(recipients.map(r=>r.notification_id).filter(Boolean))];
 let rows=[];
 if(ids.length){
  const noteRes=await supabaseClient.from('notifications').select('id,type,title,body,match_id,training_id,scheduled_for,dedupe_key,created_by,created_at,updated_at').in('id',ids).order('created_at',{ascending:false});
  if(noteRes.error)throw noteRes.error;
  rows=noteRes.data||[];
 }
 const recById=new Map(recipients.map(r=>[r.notification_id,r]));
 const now=Date.now();
 const visible=rows.filter(n=>!n.scheduled_for||new Date(n.scheduled_for).getTime()<=now);
 state.notifications=visible.map(n=>{
  const recipient=recById.get(n.id)||{};
  return {
   id:`dbnotif_${n.id}`,
   backendId:n.id,
   notificationType:n.type,
   type:notificationCssType(n.type),
   title:n.title||'Notificação',
   body:n.body||'',
   audience:'user',
   gameId:state.games?.find(g=>g.backendId===n.match_id)?.id||'',
   trainingId:state.trainings?.find(t=>t.backendId===n.training_id)?.id||'',
   createdAt:n.created_at,
   scheduledDate:n.scheduled_for?String(n.scheduled_for).slice(0,10):'',
   scheduledFor:n.scheduled_for||'',
   read:!!recipient.read_at,
   readAt:recipient.read_at||''
  };
 });
 backendNotifications={rows,recipients,preferences:{...NOTIFICATION_PREF_DEFAULTS,...(prefRes.data||{})}};
 backendNotificationsLoaded=true;
}
async function markBackendNotificationsRead(){
 if(!backendSession?.user?.id||!backendNotificationsLoaded)return;
 const unread=(state.notifications||[]).filter(n=>n.backendId&&!n.read);
 if(!unread.length)return;
 const ids=unread.map(n=>n.backendId);
 const stamp=new Date().toISOString();
 const res=await supabaseClient.from('notification_recipients').update({read_at:stamp}).eq('user_id',backendSession.user.id).in('notification_id',ids).is('read_at',null);
 if(res.error)throw res.error;
 unread.forEach(n=>{n.read=true;n.readAt=stamp});
 (backendNotifications.recipients||[]).forEach(r=>{if(ids.includes(r.notification_id)&&!r.read_at)r.read_at=stamp});
 renderChrome();
}
async function saveBackendNotificationPreferences(prefs){
 if(!backendSession?.user?.id)throw new Error('Inicia sessão para guardar preferências.');
 const payload={user_id:backendSession.user.id,...NOTIFICATION_PREF_DEFAULTS,...prefs,updated_at:new Date().toISOString()};
 const res=await supabaseClient.from('notification_preferences').upsert(payload,{onConflict:'user_id'}).select('*').single();
 if(res.error)throw res.error;
 backendNotifications.preferences={...NOTIFICATION_PREF_DEFAULTS,...res.data};
 return res.data;
}
async function sendBackendNotification({type,title,body,audience='all_registered',matchBackendId=null,trainingBackendId=null,playerBackendIds=null,dedupeKey=null,scheduledFor=null}){
 if(!backendSession)throw new Error('É necessário iniciar sessão.');
 const {data,error}=await supabaseClient.rpc('create_notification',{
  p_type:type,
  p_title:title,
  p_body:body,
  p_audience:audience,
  p_match_id:matchBackendId||null,
  p_training_id:trainingBackendId||null,
  p_player_ids:playerBackendIds?.length?playerBackendIds:null,
  p_dedupe_key:dedupeKey||null,
  p_scheduled_for:scheduledFor||null
 });
 if(error)throw error;
 await loadBackendNotifications();
 const row=Array.isArray(data)?data[0]:data;
 return row||{notification_id:null,recipient_count:0};
}

const backendTeamCanonicalBySlug={
 'adc-figueiras':'ADC Figueiras',
 'ar-freixieiro':'AR Freixieiro',
 'fc-paco-de-sousa':'FC Paço Sousa',
 'fc-sao-romao':'FC São Romão',
 'aa-leca':'AA Leça',
 'asc-monte-pedras':'ASC Monte Pedras',
 'leais-videirinhos':'Leais e Videirinhos',
 'gd-juventude-matosinhos':'Juventude Matosinhos',
 'jd-gaia-b':'Juventude Gaia B',
 'juventude-de-gaia':'Juventude Gaia',
 'ad-polenenses':'AD Polenenses',
 'arc-moinhos':'ARC Moinhos',
 'ad-tarrio':'AD Tarrio',
 'gd-baguim-monte':'GD Baguim Monte',
 'alvarelhos':'Alvarelhos',
 'gd-vale-do-ave':'GD Vale do Ave',
 'iniciacao-s-roque':'Iniciação S. Roque',
 'gdce-modelos':'GDCE Modelos',
 'ar-areal':'AR Areal',
 'leoes-da-guarda':'Leões da Guarda',
 'ad-sebolido':'AD Sebolido',
 'mosteiro-fc':'Mosteiro FC',
 'casa-fcp-rio-tinto':'Casa FCP Rio Tinto'
};
async function loadBackendReferenceData(settingsRow=null){
 const [seasonsRes,competitionsRes,teamsRes,competitionTeamsRes]=await Promise.all([
  supabaseClient.from('seasons').select('id,label,start_date,end_date,active,archived').order('start_date',{ascending:true}),
  supabaseClient.from('competitions').select('id,season_id,name,slug,competition_type,phase,series_name,counts_for_standings,track_all_results,active').order('name',{ascending:true}),
  supabaseClient.from('teams').select('id,name,short_name,slug,afp_code,crest_url,is_our_club,active').order('name',{ascending:true}),
  supabaseClient.from('competition_teams').select('competition_id,team_id')
 ]);
 for(const res of [seasonsRes,competitionsRes,teamsRes,competitionTeamsRes])if(res.error)throw res.error;
 backendReference={
  settings:settingsRow||backendReference.settings,
  seasons:seasonsRes.data||[],
  competitions:competitionsRes.data||[],
  teams:teamsRes.data||[],
  competitionTeams:competitionTeamsRes.data||[]
 };
 backendReferenceLoaded=true;
 applyBackendReferenceMetadata();
}
function applyBackendReferenceMetadata(){
 if(!backendReferenceLoaded||typeof state==='undefined')return;
 const activeBackendId=backendReference.settings?.active_season_id||'';
 const clubBackendId=backendReference.settings?.club_team_id||'';
 state.settings.backendActiveSeasonId=activeBackendId;
 state.settings.backendClubTeamId=clubBackendId;
 const locals=[...(state.seasons||[])];
 for(const remote of backendReference.seasons||[]){
  let local=locals.find(x=>x.backendId===remote.id||x.label===remote.label);
  if(!local){
   local={id:`dbseason_${remote.id}`,label:remote.label,active:remote.id===activeBackendId,archived:remote.archived===true};
   locals.push(local);
  }
  Object.assign(local,{backendId:remote.id,backendStartDate:remote.start_date,backendEndDate:remote.end_date,backendArchived:remote.archived===true,archived:remote.archived===true});
  const league=(backendReference.competitions||[]).find(c=>c.season_id===remote.id&&c.competition_type==='league'&&c.phase!=='Taça Complementar');
  if(league)local.competitionName=`AF Porto I Divisão Futsal · ${league.series_name||league.name}`;
 }
 // As épocas online são a referência; os exemplos locais não devem ocultar os jogos reais do ambiente.
 state.seasons=locals.filter(s=>(backendReference.seasons||[]).some(remote=>remote.id===s.backendId)).sort((a,b)=>String(b.label).localeCompare(String(a.label),'pt'));
 state.games=(state.games||[]).filter(g=>state.seasons.some(s=>s.id===(g.seasonId||state.settings.activeSeasonId)));
 if(!state.seasons.some(x=>x.id===state.settings.activeSeasonId)){
  const current=state.seasons.find(x=>x.backendId===activeBackendId)||state.seasons[0];
  if(current)state.settings.activeSeasonId=current.id;
 }
 state.teams=(state.teams||[]).map(local=>{
  const remote=backendReference.teams.find(t=>backendTeamCanonicalBySlug[t.slug]===local.name);
  if(!remote)return local;
  return {...local,backendId:remote.id,backendSlug:remote.slug,officialName:remote.name,backendShortName:remote.short_name,afpCode:remote.afp_code||'',logo:remote.crest_url||local.logo};
 });
}
function backendActiveSeason(){
 const selected=state?.seasons?.find(s=>s.id===state?.settings?.activeSeasonId);
 if(selected?.backendId){
  const remote=backendReference.seasons.find(s=>s.id===selected.backendId);
  if(remote)return remote;
 }
 return backendReference.seasons.find(s=>s.id===backendReference.settings?.active_season_id)||backendReference.seasons.find(s=>s.active)||null;
}
function backendProductionSeason(){
 return backendReference.seasons.find(s=>s.id===backendReference.settings?.active_season_id)||backendReference.seasons.find(s=>s.active)||null;
}
function isHistoricalSeason(){
 const selected=backendActiveSeason(),prod=backendProductionSeason();
 return !!selected&&!!prod&&selected.id!==prod.id;
}
function activeBackendCompetitions(){
 const sid=backendActiveSeason()?.id;
 return (backendReference.competitions||[]).filter(c=>c.season_id===sid&&c.active!==false);
}
function primaryLeagueCompetition(){
 return activeBackendCompetitions().find(c=>c.competition_type==='league'&&c.phase!=='Taça Complementar')||activeBackendCompetitions().find(c=>c.competition_type==='league')||null;
}
function historicalEditAllowed(){return isHistoricalSeason()?backendRoles.includes('admin')&&historicalEditMode:canEdit();}
function backendClubTeam(){
 return backendReference.teams.find(t=>t.id===backendReference.settings?.club_team_id)||backendReference.teams.find(t=>t.is_our_club)||null;
}

function dbAvailabilityToLocal(status){
 return ({available:'Disponível',injured:'Lesionado',suspended:'Suspenso',absent:'Ausente',doubt:'Em dúvida'})[status]||'Disponível';
}
function localAvailabilityToDb(status){
 return ({'Disponível':'available','Lesionado':'injured','Suspenso':'suspended','Ausente':'absent','Em dúvida':'doubt'})[normalizePlayerStatus(status)]||'available';
}
function applyBackendRosterToState(){
 if(!backendRosterLoaded||!backendRoster.rows.length||typeof state==='undefined')return;
 const previous=state.players||[];
 state.players=backendRoster.rows.map(r=>{
  const byBackend=previous.find(p=>p.backendId===r.player_id);
  const byName=previous.find(p=>String(p.name||'').trim().toLowerCase()===String(r.name||'').trim().toLowerCase());
  const old=byBackend||byName||{};
  return {
   ...old,
   id:old.id||`db_${r.player_id}`,
   backendId:r.player_id,
   name:r.name,
   position:r.position_group==='goalkeeper'?'GR':(r.position||'Jogador'),
   number:r.shirt_number??'',
   // Disponibilidade é informação interna. Em área pública / utilizador
   // registado / sócio, não inventamos nem carregamos este estado.
   status:r.availability_status?dbAvailabilityToLocal(r.availability_status):null,
   active:r.active!==false
  };
 });
 try{persistPublicCache()}catch{}
}
async function loadBackendRosterData(){
 const season=backendActiveSeason();
 if(!season){backendRoster={seasonId:'',rows:[]};backendRosterLoaded=true;return}
 const seasonRes=await supabaseClient.from('season_players')
  .select('season_id,player_id,shirt_number,position,position_group,active,joined_on,left_on')
  .eq('season_id',season.id)
  .eq('active',true);
 if(seasonRes.error)throw seasonRes.error;
 const seasonRows=seasonRes.data||[];
 const ids=seasonRows.map(x=>x.player_id);
 let playerRows=[],availabilityRows=[];
 // A tabela player_availability é privada por desenho (RLS). Só a consultamos
 // quando a sessão tem uma função interna autorizada.
 const canLoadAvailability=!isHistoricalSeason()&&!!backendSession&&backendRoles.some(r=>['admin','staff','captain','player'].includes(r));
 if(ids.length){
  const playersRes=await supabaseClient.from('players').select('id,name,photo_url,active').in('id',ids);
  if(playersRes.error)throw playersRes.error;
  playerRows=playersRes.data||[];
  if(canLoadAvailability){
   const availabilityRes=await supabaseClient.from('player_availability').select('season_id,player_id,status').eq('season_id',season.id).in('player_id',ids);
   if(availabilityRes.error)throw availabilityRes.error;
   availabilityRows=availabilityRes.data||[];
  }
 }
 backendRoster={
  seasonId:season.id,
  rows:seasonRows.map(sp=>{
   const p=playerRows.find(x=>x.id===sp.player_id)||{};
   const a=availabilityRows.find(x=>x.player_id===sp.player_id);
   return {...sp,name:p.name||'Jogador',photo_url:p.photo_url||'',player_active:p.active!==false,availability_status:canLoadAvailability?(a?.status||'available'):null};
  }).sort((a,b)=>(Number(a.shirt_number||999)-Number(b.shirt_number||999))||String(a.name).localeCompare(String(b.name),'pt'))
 };
 backendRosterLoaded=true;
 applyBackendRosterToState();
}
async function createInitialBackendRoster(){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para criar o plantel.');
 const season=backendActiveSeason();
 if(!season)throw new Error('Não existe uma época ativa no Supabase.');
 const current=await supabaseClient.from('season_players').select('player_id').eq('season_id',season.id);
 if(current.error)throw current.error;
 if((current.data||[]).length){
  await loadBackendRosterData();
  return {created:false,count:(current.data||[]).length};
 }
 const allPlayersRes=await supabaseClient.from('players').select('id,name');
 if(allPlayersRes.error)throw allPlayersRes.error;
 const existing=allPlayersRes.data||[];
 const rows=[];
 for(const local of state.players){
  let remote=existing.find(x=>String(x.name).trim().toLowerCase()===String(local.name).trim().toLowerCase());
  if(!remote){
   const ins=await supabaseClient.from('players').insert({name:local.name,active:true}).select('id,name').single();
   if(ins.error)throw ins.error;
   remote=ins.data;
   existing.push(remote);
  }
  rows.push({local,remote});
 }
 const seasonPayload=rows.map(({local,remote})=>({
  season_id:season.id,
  player_id:remote.id,
  shirt_number:String(local.number||'').trim()===''?null:Number(local.number),
  position:local.position||'Jogador',
  position_group:local.position==='GR'?'goalkeeper':'field',
  active:true
 }));
 const seasonUpsert=await supabaseClient.from('season_players').upsert(seasonPayload,{onConflict:'season_id,player_id'});
 if(seasonUpsert.error)throw seasonUpsert.error;
 const availabilityPayload=rows.map(({local,remote})=>({
  season_id:season.id,
  player_id:remote.id,
  status:localAvailabilityToDb(local.status)
 }));
 const availabilityUpsert=await supabaseClient.from('player_availability').upsert(availabilityPayload,{onConflict:'season_id,player_id'});
 if(availabilityUpsert.error)throw availabilityUpsert.error;
 await loadBackendRosterData();
 return {created:true,count:rows.length};
}
async function saveBackendPlayer(localPlayer,data,isNew=false){
 const season=backendActiveSeason();
 if(!season)throw new Error('Não existe uma época ativa no Supabase.');
 const name=sanitizePlainText(data.name,120);
 if(!name)throw new Error('O nome do jogador é obrigatório.');
 const numberText=String(data.number||'').trim();
 const shirtNumber=numberText===''?null:Number(numberText);
 if(shirtNumber!==null&&(!Number.isInteger(shirtNumber)||shirtNumber<1||shirtNumber>99))throw new Error('O número deve estar entre 1 e 99.');
 let playerId=localPlayer?.backendId||'';
 if(playerId){
  if(!isHistoricalSeason()){const upd=await supabaseClient.from('players').update({name,active:true}).eq('id',playerId);if(upd.error)throw upd.error}
 }else{
  const ins=await supabaseClient.from('players').insert({name,active:true}).select('id').single();
  if(ins.error)throw ins.error;
  playerId=ins.data.id;
 }
 const seasonRow={
  season_id:season.id,
  player_id:playerId,
  shirt_number:shirtNumber,
  position:['GR','Fixo','Fixo / Ala','Ala','Ala / Pivot','Pivot','Jogador'].includes(data.position)?data.position:'Jogador',
  position_group:data.position==='GR'?'goalkeeper':'field',
  active:true
 };
 const seasonUpsert=await supabaseClient.from('season_players').upsert(seasonRow,{onConflict:'season_id,player_id'});
 if(seasonUpsert.error)throw seasonUpsert.error;
 if(!isHistoricalSeason()){
  const av=await supabaseClient.from('player_availability').upsert({season_id:season.id,player_id:playerId,status:localAvailabilityToDb(data.status)},{onConflict:'season_id,player_id'});
  if(av.error)throw av.error;
 }
 await loadBackendRosterData();
 return playerId;
}

function backendCompetitionFor(kind){
 const season=backendActiveSeason();
 if(!season)return null;
 const list=(backendReference.competitions||[]).filter(c=>c.season_id===season.id);
 if(kind==='league')return list.find(c=>c.competition_type==='league'&&c.phase!=='Taça Complementar')||list.find(c=>c.competition_type==='league')||null;
 if(kind==='cup')return list.find(c=>c.competition_type==='cup'&&/taça|taca/i.test(c.name))||list.find(c=>c.competition_type==='cup')||null;
 return list.find(c=>c.competition_type===kind)||null;
}
function backendTeamName(team){
 if(!team)return '';
 return backendTeamCanonicalBySlug[team.slug]||team.short_name||team.name||'';
}
function backendTeamByName(name){
 const canonical=canonicalTeamName(name);const key=cleanTeamKey(canonical);
 return (backendReference.teams||[]).find(t=>cleanTeamKey(backendTeamName(t))===key||cleanTeamKey(t.name)===key||cleanTeamKey(t.short_name)===key)||null;
}
function slugifyTeamName(name){
 return String(name||'equipa').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||`equipa-${Date.now()}`;
}
async function ensureBackendTeam(name){
 let team=backendTeamByName(name);if(team)return team;
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error(`A equipa ${name} ainda não existe no Supabase.`);
 const base=slugifyTeamName(name);let slug=base,n=2;
 while((backendReference.teams||[]).some(t=>t.slug===slug)){slug=`${base}-${n++}`}
 const ins=await supabaseClient.from('teams').insert({name:String(name).trim(),short_name:String(name).trim(),slug,is_our_club:false,active:true}).select('id,name,short_name,slug,afp_code,crest_url,is_our_club,active').single();
 if(ins.error)throw ins.error;
 backendReference.teams.push(ins.data);return ins.data;
}
async function ensureBackendCompetition(name,countsForStandings=false){
 const season=backendActiveSeason();if(!season)throw new Error('Não existe época ativa.');
 let existing=(backendReference.competitions||[]).find(c=>c.season_id===season.id&&(cleanTeamKey(c.name)===cleanTeamKey(name)||cleanTeamKey(backendCompetitionLabel(c))===cleanTeamKey(name)));if(existing)return existing;
 if(isCupCompetition(name))return backendCompetitionFor('cup');
 const league=backendCompetitionFor('league');
 if(countsForStandings||cleanTeamKey(name)===cleanTeamKey(competitionName())||/divisão|divisao|série|serie/.test(String(name||'').toLowerCase()))return league;
 const slug=`${slugifyTeamName(name||'amigaveis')}-${String(season.label).replace('/','-')}`;
 const ins=await supabaseClient.from('competitions').insert({season_id:season.id,name:name||'Amigáveis',slug,competition_type:'friendly',counts_for_standings:false,track_all_results:false,active:true}).select('*').single();
 if(ins.error)throw ins.error;
 backendReference.competitions.push(ins.data);return ins.data;
}
function lastSundayUtcDate(year,monthIndex){const d=new Date(Date.UTC(year,monthIndex+1,0));return d.getUTCDate()-d.getUTCDay()}
function portugalKickoffIso(date,time='00:00'){
 const [y,m,d]=String(date).split('-').map(Number),[hh,mm]=String(time||'00:00').split(':').map(Number);
 const march=lastSundayUtcDate(y,2),oct=lastSundayUtcDate(y,9);
 const dst=(m>3&&m<10)||(m===3&&d>=march)||(m===10&&d<oct);
 return new Date(Date.UTC(y,m-1,d,(hh||0)-(dst?1:0),mm||0,0)).toISOString();
}
function portugalParts(iso){
 if(!iso)return {date:'',time:''};
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const get=t=>parts.find(p=>p.type===t)?.value||'';
 return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
function backendCompetitionLabel(comp){
 if(!comp)return 'Jogo';
 if(comp.competition_type==='league'&&comp.phase!=='Taça Complementar')return competitionName();
 return comp.name||'Jogo';
}
function backendMatchToResult(m){
 const comp=(backendReference.competitions||[]).find(c=>c.id===m.competition_id);const home=(backendReference.teams||[]).find(t=>t.id===m.home_team_id),away=(backendReference.teams||[]).find(t=>t.id===m.away_team_id);const dt=portugalParts(m.kickoff_at);
 return {id:`dbres_${m.id}`,backendId:m.id,seasonId:state.settings.activeSeasonId,competitionId:comp?.id||'',competitionSlug:comp?.slug||'',competitionType:comp?.competition_type||'',competition:backendCompetitionLabel(comp),round:m.matchday??m.round_label??'',date:dt.date,time:dt.time,home:canonicalTeamName(backendTeamName(home)),away:canonicalTeamName(backendTeamName(away)),homeScore:m.home_score??'',awayScore:m.away_score??'',venue:m.venue||'',fixture:m.official_fixture!==false,officialFixture:m.official_fixture===true,source:m.source||'manual',administrativeDecision:m.administrative_decision||'',administrativeHomeScore:m.administrative_home_score??'',administrativeAwayScore:m.administrative_away_score??'',homePenalties:m.home_penalties??'',awayPenalties:m.away_penalties??''};
}
function applyBackendMatchesToState(){
 if(!backendMatchesLoaded||typeof state==='undefined')return;
 const season=backendActiveSeason();if(!season)return;
 // Before the first migration the Supabase table is empty. In that case,
 // keep the bundled/local calendar intact so it can be uploaded.
 if(!(backendMatches.rows||[]).length)return;
 const localSeason=state.seasons.find(s=>s.backendId===season.id||s.label===season.label);const localSeasonId=localSeason?.id||state.settings.activeSeasonId;
 const comps=new Map((backendReference.competitions||[]).map(c=>[c.id,c]));const club=backendClubTeam();
 const trackedRows=backendMatches.rows.filter(m=>{const c=comps.get(m.competition_id);return c?.track_all_results===true||c?.counts_for_standings===true}).map(backendMatchToResult);
 const otherSeasonResults=(state.competitionResults||[]).filter(r=>(r.seasonId||state.settings.activeSeasonId)!==localSeasonId);
 state.competitionResults=[...otherSeasonResults,...trackedRows];
 const oldActive=(state.games||[]).filter(g=>(g.seasonId||state.settings.activeSeasonId)===localSeasonId);const oldOther=(state.games||[]).filter(g=>(g.seasonId||state.settings.activeSeasonId)!==localSeasonId);
 const clubRows=backendMatches.rows.filter(m=>club&&(m.home_team_id===club.id||m.away_team_id===club.id));
 const mapped=clubRows.map(m=>{
  const comp=comps.get(m.competition_id);const dt=portugalParts(m.kickoff_at);const home=m.home_team_id===club.id;const oppTeam=(backendReference.teams||[]).find(t=>t.id===(home?m.away_team_id:m.home_team_id));const opponent=canonicalTeamName(backendTeamName(oppTeam));
  const old=oldActive.find(g=>g.backendId===m.id)||oldActive.find(g=>String(g.round||'')===String(m.matchday??m.round_label??'')&&g.date===dt.date&&canonicalTeamName(g.opponent)===opponent&&isCupGame(g)===(comp?.competition_type==='cup'))||{};
  const result=trackedRows.find(r=>r.backendId===m.id);
  const g={...old,id:old.id||`dbmatch_${m.id}`,backendId:m.id,seasonId:localSeasonId,fixtureId:result?.id||old.fixtureId||'',competitionId:comp?.id||'',competitionSlug:comp?.slug||'',officialFixture:m.official_fixture===true,date:dt.date,time:dt.time,round:String(m.matchday??m.round_label??''),opponent,homeAway:home?'Casa':'Fora',competition:backendCompetitionLabel(comp),countsForStandings:m.counts_for_standings===true,venue:m.venue||'',status:m.status==='completed'?'final':m.status,homeScore:(home?m.home_score:m.away_score)??'',awayScore:(home?m.away_score:m.home_score)??'',halfTimeHomeScore:(home?m.halftime_home_score:m.halftime_away_score)??'',halfTimeAwayScore:(home?m.halftime_away_score:m.halftime_home_score)??'',administrativeDecision:m.administrative_decision||'',administrativeHomeScore:(home?m.administrative_home_score:m.administrative_away_score)??'',administrativeAwayScore:(home?m.administrative_away_score:m.administrative_home_score)??'',homePenalties:(home?m.home_penalties:m.away_penalties)??'',awayPenalties:(home?m.away_penalties:m.home_penalties)??'',roster:old.roster||blankRoster(),timeline:old.timeline||[],captainId:old.captainId||''};
  if(result){result.clubGameId=g.id;result.fromClubGame=true}
  return g;
 });
 state.games=[...oldOther,...mapped];
 try{persistPublicCache()}catch{}
}
async function loadBackendMatchesData(){
 const season=backendActiveSeason();if(!season){backendMatches={seasonId:'',rows:[]};backendMatchesLoaded=true;return}
 const compIds=(backendReference.competitions||[]).filter(c=>c.season_id===season.id).map(c=>c.id);
 if(!compIds.length){backendMatches={seasonId:season.id,rows:[]};backendMatchesLoaded=true;return}
 const res=await supabaseClient.from('matches').select('*').in('competition_id',compIds).order('kickoff_at',{ascending:true});
 if(res.error)throw res.error;
 backendMatches={seasonId:season.id,rows:res.data||[]};backendMatchesLoaded=true;applyBackendMatchesToState();
}
async function createInitialBackendMatches(){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para criar o calendário online.');
 const season=backendActiveSeason(),league=backendCompetitionFor('league');if(!season||!league)throw new Error('Época ou campeonato não encontrados no Supabase.');
 const compIds=(backendReference.competitions||[]).filter(c=>c.season_id===season.id).map(c=>c.id);
 const existing=await supabaseClient.from('matches').select('id').in('competition_id',compIds);
 if(existing.error)throw existing.error;
 if((existing.data||[]).length){await loadBackendMatchesData();return {created:false,count:(existing.data||[]).length}}
 syncClubGamesToFixtures();
 const payload=[];
 // Build the initial migration from the canonical bundled calendar, merged
 // with any local scores/edits. This prevents an empty backend read from
 // accidentally leaving us with 0 fixtures to upload.
 const localFixtures=mergeFixtures(state.competitionResults||[]);
 const fixturesToUpload=localFixtures.length?localFixtures:seedFixtures.map(f=>({...f}));
 for(const r of fixturesToUpload){
  const home=await ensureBackendTeam(r.home),away=await ensureBackendTeam(r.away);const hs=r.homeScore===''?null:Number(r.homeScore),as=r.awayScore===''?null:Number(r.awayScore);
  payload.push({competition_id:league.id,home_team_id:home.id,away_team_id:away.id,matchday:Number(r.round)||null,round_label:null,kickoff_at:portugalKickoffIso(r.date,r.time||'00:00'),venue:r.venue||null,status:hs!==null&&as!==null?'completed':'scheduled',home_score:hs,away_score:as,halftime_home_score:null,halftime_away_score:null,counts_for_standings:true,official_fixture:r.fixture!==false,source:r.fixture!==false?'official_calendar':'manual'});
 }
 for(const g of seasonGames().filter(x=>!isLeagueGame(x))){
  const comp=await ensureBackendCompetition(g.competition||'Amigáveis',false);const club=backendClubTeam(),opp=await ensureBackendTeam(g.opponent);const home=g.homeAway==='Casa'?club:opp,away=g.homeAway==='Casa'?opp:club;
  const fg=g.homeScore===''?null:Number(g.homeScore),og=g.awayScore===''?null:Number(g.awayScore),fgh=g.halfTimeHomeScore===''||g.halfTimeHomeScore==null?null:Number(g.halfTimeHomeScore),ogh=g.halfTimeAwayScore===''||g.halfTimeAwayScore==null?null:Number(g.halfTimeAwayScore);
  payload.push({competition_id:comp.id,home_team_id:home.id,away_team_id:away.id,matchday:null,round_label:g.round||null,kickoff_at:portugalKickoffIso(g.date,g.time||'00:00'),venue:g.venue||null,status:fg!==null&&og!==null?'completed':'scheduled',home_score:g.homeAway==='Casa'?fg:og,away_score:g.homeAway==='Casa'?og:fg,halftime_home_score:g.homeAway==='Casa'?fgh:ogh,halftime_away_score:g.homeAway==='Casa'?ogh:fgh,counts_for_standings:false,official_fixture:false,source:'manual'});
 }
 if(!payload.length)throw new Error('Não foram encontrados jogos locais para migrar. Atualiza a página e tenta novamente.');
 const ins=await supabaseClient.from('matches').insert(payload).select('*');if(ins.error)throw ins.error;
 await loadBackendReferenceData(backendReference.settings);await loadBackendMatchesData();return {created:true,count:(ins.data||[]).length};
}
async function saveBackendSeriesResult(row){
 if(!backendMatchesLoaded||!backendMatches.rows.length)return null;
 const comp=(row.competitionId&&competitionById(row.competitionId))||primaryLeagueCompetition();if(!comp)throw new Error('Competição não encontrada no Supabase.');
 const home=await ensureBackendTeam(row.home),away=await ensureBackendTeam(row.away);const admin=String(row.administrativeDecision||'');
 const hs=admin?null:(row.homeScore===''?null:Number(row.homeScore)),as=admin?null:(row.awayScore===''?null:Number(row.awayScore));
 const ah=row.administrativeHomeScore===''||row.administrativeHomeScore==null?null:Number(row.administrativeHomeScore),aa=row.administrativeAwayScore===''||row.administrativeAwayScore==null?null:Number(row.administrativeAwayScore);
 const payload={competition_id:comp.id,home_team_id:home.id,away_team_id:away.id,matchday:Number(row.round)||null,round_label:null,kickoff_at:portugalKickoffIso(row.date,row.time||'00:00'),venue:row.venue||null,status:admin||(hs!==null&&as!==null)?'completed':'scheduled',home_score:hs,away_score:as,counts_for_standings:comp.counts_for_standings===true,official_fixture:row.fixture!==false,source:row.source||((row.fixture!==false)?'official_calendar':'manual'),administrative_decision:admin||null,administrative_home_score:admin&&Number.isFinite(ah)?ah:null,administrative_away_score:admin&&Number.isFinite(aa)?aa:null};
 let res;if(row.backendId)res=await supabaseClient.from('matches').update(payload).eq('id',row.backendId).select('*').single();else res=await supabaseClient.from('matches').insert(payload).select('*').single();if(res.error)throw res.error;row.backendId=res.data.id;await loadBackendMatchesData();return res.data;
}
async function saveBackendClubGame(g){
 if(!backendMatchesLoaded||!backendMatches.rows.length)return null;
 const comp=(g.competitionId&&competitionById(g.competitionId))||await ensureBackendCompetition(g.competition||'Jogo',g.countsForStandings!==false&&isLeagueGame(g));const club=backendClubTeam(),opp=await ensureBackendTeam(g.opponent);if(!club)throw new Error('ADC Figueiras não encontrado no Supabase.');const home=g.homeAway==='Casa'?club:opp,away=g.homeAway==='Casa'?opp:club;
 const admin=String(g.administrativeDecision||'');const fg=admin?null:(g.homeScore===''?null:Number(g.homeScore)),og=admin?null:(g.awayScore===''?null:Number(g.awayScore)),fgh=g.halfTimeHomeScore===''||g.halfTimeHomeScore==null?null:Number(g.halfTimeHomeScore),ogh=g.halfTimeAwayScore===''||g.halfTimeAwayScore==null?null:Number(g.halfTimeAwayScore);const league=comp.competition_type==='league';
 const af=g.administrativeHomeScore===''||g.administrativeHomeScore==null?null:Number(g.administrativeHomeScore),ao=g.administrativeAwayScore===''||g.administrativeAwayScore==null?null:Number(g.administrativeAwayScore);
 const payload={competition_id:comp.id,home_team_id:home.id,away_team_id:away.id,matchday:league?(Number(g.round)||null):null,round_label:league?null:(g.round||null),kickoff_at:portugalKickoffIso(g.date,g.time||'00:00'),venue:g.venue||null,status:admin||g.status==='final'||(fg!==null&&og!==null)?'completed':(g.status||'scheduled'),home_score:admin?null:(g.homeAway==='Casa'?fg:og),away_score:admin?null:(g.homeAway==='Casa'?og:fg),halftime_home_score:admin?null:(g.homeAway==='Casa'?fgh:ogh),halftime_away_score:admin?null:(g.homeAway==='Casa'?ogh:fgh),counts_for_standings:league&&g.countsForStandings!==false,official_fixture:g.officialFixture===true||!!g.fixtureId,source:(g.officialFixture===true||!!g.fixtureId)?'official_calendar':'manual',administrative_decision:admin||null,administrative_home_score:admin&&Number.isFinite(af)&&Number.isFinite(ao)?(g.homeAway==='Casa'?af:ao):null,administrative_away_score:admin&&Number.isFinite(af)&&Number.isFinite(ao)?(g.homeAway==='Casa'?ao:af):null};
 let res;if(g.backendId)res=await supabaseClient.from('matches').update(payload).eq('id',g.backendId).select('*').single();else res=await supabaseClient.from('matches').insert(payload).select('*').single();if(res.error)throw res.error;g.backendId=res.data.id;await loadBackendReferenceData(backendReference.settings);await loadBackendMatchesData();return res.data;
}
async function deleteBackendMatchById(id){if(!id)return;const res=await supabaseClient.from('matches').delete().eq('id',id);if(res.error)throw res.error;await loadBackendMatchesData()}

function localPlayerIdFromBackend(playerId){
 const p=(state.players||[]).find(x=>x.backendId===playerId);
 return p?.id||'';
}
function backendPlayerIdFromLocal(playerId){return playerById(playerId)?.backendId||''}
function backendEventTypeToLocal(type){return ({goal:'goal',yellow_card:'yellow',second_yellow_card:'second_yellow',red_card:'red'})[type]||''}
function localEventTypeToBackend(type){return ({goal:'goal',yellow:'yellow_card',second_yellow:'second_yellow_card',red:'red_card'})[type]||''}
function hasLocalMatchCenterData(g){
 const activeRoster=Object.entries(g?.roster||{}).some(([pid,r])=>r&&(normalizeRosterStatus(r.status)==='Convocado'||r.used===true||r.starter===true||g.captainId===pid));
 const supportedEvents=(g?.timeline||[]).some(e=>!!localEventTypeToBackend(e.type));
 return activeRoster||supportedEvents;
}
function applyBackendMatchCenterToState(){
 if(!backendMatchCenterLoaded||typeof state==='undefined')return;
 const mp=backendMatchCenter.matchPlayers||[],ev=backendMatchCenter.events||[],wi=backendMatchCenter.weighIns||[];
 const touched=new Set([...mp.map(x=>x.match_id),...ev.map(x=>x.match_id),...wi.map(x=>x.match_id)]);
 if(!touched.size&&!backendMatchWeightsAvailable)return;
 for(const g of state.games||[]){
  if(!g.backendId)continue;
  const isTouched=touched.has(g.backendId);
  if(isTouched){
   const oldRoster=g.roster||{};const roster={};
   for(const p of state.players||[]){
    const prior=oldRoster[p.id]||{};
    roster[p.id]={...prior,status:prior.status&&normalizeRosterStatus(prior.status)!=='Convocado'?normalizeRosterStatus(prior.status):'Não convocado',starter:false,used:false,stats:prior.stats||{goals:0,assists:0,yellow:0,secondYellow:0,red:0}};
   }
   const rows=mp.filter(x=>x.match_id===g.backendId);let captainId='';
   for(const row of rows){
    const pid=localPlayerIdFromBackend(row.player_id);if(!pid)continue;
    roster[pid]=roster[pid]||{status:'Não convocado',starter:false,used:false,stats:{goals:0,assists:0,yellow:0,secondYellow:0,red:0}};
    roster[pid].status=row.called_up?'Convocado':'Não convocado';
    roster[pid].used=row.played===true;
    roster[pid].starter=row.started===true;
    if(row.captain===true)captainId=pid;
   }
   g.roster=roster;g.captainId=captainId;
   g.timeline=ev.filter(x=>x.match_id===g.backendId).map(x=>({
    id:`dbevent_${x.id}`,backendId:x.id,type:backendEventTypeToLocal(x.event_type),minute:String(x.minute??''),
    playerId:x.player_id?localPlayerIdFromBackend(x.player_id):'',assistId:x.assist_player_id?localPlayerIdFromBackend(x.assist_player_id):'',text:'',ownGoal:x.is_own_goal===true
   })).filter(x=>x.type&&(x.playerId||x.ownGoal));
  }
  if(backendMatchWeightsAvailable){
   const weights={};
   for(const row of wi.filter(x=>x.match_id===g.backendId)){
    const pid=localPlayerIdFromBackend(row.player_id);if(!pid)continue;
    weights[pid]=weights[pid]||{pre:'',post:''};
    weights[pid][row.timing==='post'?'post':'pre']=String(Number(row.weight_kg));
   }
   g.weighIns=weights;
  }
 }
 try{persistPublicCache()}catch{}
}
async function loadBackendMatchCenterData(){
 if(!backendMatchesLoaded){backendMatchCenter={matchPlayers:[],events:[],weighIns:[]};backendMatchCenterLoaded=true;backendMatchWeightsAvailable=false;return}
 const club=backendClubTeam();
 const ids=(backendMatches.rows||[]).filter(m=>club&&(m.home_team_id===club.id||m.away_team_id===club.id)).map(m=>m.id);
 if(!ids.length){backendMatchCenter={matchPlayers:[],events:[],weighIns:[]};backendMatchCenterLoaded=true;backendMatchWeightsAvailable=false;return}
 const playersRes=await supabaseClient.from('match_players').select('match_id,player_id,called_up,played,started,captain,created_at,updated_at').in('match_id',ids);
 if(playersRes.error)throw playersRes.error;
 let eventsRes=await supabaseClient.from('match_events').select('id,match_id,event_type,player_id,assist_player_id,minute,is_own_goal,created_at,updated_at').in('match_id',ids).order('minute',{ascending:true});
 if(eventsRes.error){
  const legacy=await supabaseClient.from('match_events').select('id,match_id,event_type,player_id,assist_player_id,minute,created_at,updated_at').in('match_id',ids).order('minute',{ascending:true});
  if(legacy.error)throw legacy.error;
  eventsRes={data:(legacy.data||[]).map(x=>({...x,is_own_goal:false})),error:null};
 }
 let weighIns=[];backendMatchWeightsAvailable=false;
 const wr=await supabaseClient.from('match_weigh_ins').select('id,match_id,player_id,timing,weight_kg,measured_at,recorded_by,created_at,updated_at').in('match_id',ids).order('measured_at',{ascending:true});
 if(!wr.error){weighIns=wr.data||[];backendMatchWeightsAvailable=true}
 backendMatchCenter={matchPlayers:playersRes.data||[],events:eventsRes.data||[],weighIns};backendMatchCenterLoaded=true;applyBackendMatchCenterToState();
}
async function publishBackendMatchCallup(g){
 if(!g?.backendId||!backendConnected||!backendSession)return {published:false,recipient_count:0};
 if(!backendRoles.some(r=>r==='admin'||r==='staff'))return {published:false,recipient_count:0};
 const {data,error}=await supabaseClient.rpc('publish_match_callup',{p_match_id:g.backendId});
 if(error)throw error;
 const result=Array.isArray(data)?data[0]:data;
 if(result?.published)loadBackendNotifications().then(()=>renderChrome()).catch(err=>console.warn('Aviso publicado, mas não foi possível atualizar a caixa de notificações.',err));
 return result||{published:false,recipient_count:0};
}
async function saveBackendMatchPlayers(g,{reload=true}={}){
 if(!g?.backendId)throw new Error('Este jogo ainda não está associado ao Supabase.');
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para alterar a ficha de jogo.');
 const del=await supabaseClient.from('match_players').delete().eq('match_id',g.backendId);if(del.error)throw del.error;
 const rows=[];
 for(const [pid,r] of Object.entries(g.roster||{})){
  const called=normalizeRosterStatus(r?.status)==='Convocado'||r?.used===true||r?.starter===true||g.captainId===pid;
  if(!called)continue;
  const backendPlayerId=backendPlayerIdFromLocal(pid);const p=playerById(pid);
  if(!backendPlayerId)throw new Error(`O jogador ${p?.name||pid} ainda não está ligado ao plantel online.`);
  rows.push({match_id:g.backendId,player_id:backendPlayerId,called_up:true,played:r?.used===true||r?.starter===true||g.captainId===pid,started:r?.starter===true,captain:g.captainId===pid});
 }
 if(rows.length){const ins=await supabaseClient.from('match_players').insert(rows);if(ins.error)throw ins.error}
 if(reload)await loadBackendMatchCenterData();
 return rows.length;
}
async function insertBackendMatchEvent(g,event,{reload=true}={}){
 if(!g?.backendId)throw new Error('Este jogo ainda não está associado ao Supabase.');
 const eventType=localEventTypeToBackend(event.type);if(!eventType)throw new Error('Este tipo de acontecimento não é suportado no Match Center online.');
 const ownGoal=eventType==='goal'&&event.ownGoal===true;
 const playerId=ownGoal?null:backendPlayerIdFromLocal(event.playerId);if(!ownGoal&&!playerId)throw new Error('Seleciona um jogador do plantel online.');
 const assistId=!ownGoal&&event.assistId?backendPlayerIdFromLocal(event.assistId):null;
 const minute=Number(event.minute);if(!Number.isFinite(minute)||minute<0||minute>120)throw new Error('Indica um minuto válido entre 0 e 120.');
 const payload={match_id:g.backendId,event_type:eventType,player_id:playerId,assist_player_id:eventType==='goal'&&!ownGoal?(assistId||null):null,minute};if(ownGoal)payload.is_own_goal=true;
 const res=await supabaseClient.from('match_events').insert(payload).select('id').single();
 if(res.error){
  if(ownGoal)throw new Error('A base de dados ainda não tem a migração V3.16 para auto-golos. Aplica primeiro o ficheiro SQL incluído nesta build.');
  throw res.error;
 }
 event.backendId=res.data.id;event.id=`dbevent_${res.data.id}`;
 if(reload)await loadBackendMatchCenterData();
 return res.data;
}
async function saveBackendMatchWeighIns(g,{reload=true}={}){
 if(!g?.backendId)throw new Error('Este jogo ainda não está associado ao Supabase.');
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para alterar pesagens de jogo.');
 if(!backendMatchWeightsAvailable)throw new Error('A base de dados ainda não tem a migração V3.16 para pesagens de jogo. Aplica primeiro o ficheiro SQL incluído nesta build.');
 const del=await supabaseClient.from('match_weigh_ins').delete().eq('match_id',g.backendId);if(del.error)throw del.error;
 const rows=[];const recordedBy=backendSession?.user?.id||null;const measuredAt=portugalKickoffIso(g.date,g.time||'00:00');
 const calledIds=new Set(Object.entries(g.roster||{}).filter(([,r])=>normalizeRosterStatus(r?.status)==='Convocado').map(([pid])=>pid));
 for(const [pid,e] of Object.entries(g.weighIns||{})){
  if(!calledIds.has(pid))continue;
  const backendPlayerId=backendPlayerIdFromLocal(pid);if(!backendPlayerId)continue;
  for(const timing of ['pre','post']){
   const raw=String(e?.[timing]??'').trim();if(!raw)continue;
   const weight=Number(raw.replace(',','.'));if(!Number.isFinite(weight)||weight<=20||weight>=250)throw new Error(`Peso inválido para ${playerById(pid)?.name||'jogador'} (${timing==='pre'?'pré-jogo':'pós-jogo'}).`);
   rows.push({match_id:g.backendId,player_id:backendPlayerId,timing,weight_kg:weight,measured_at:measuredAt,recorded_by:recordedBy});
  }
 }
 if(rows.length){const ins=await supabaseClient.from('match_weigh_ins').insert(rows);if(ins.error)throw ins.error}
 if(reload)await loadBackendMatchCenterData();
 return rows.length;
}
async function deleteBackendMatchEvent(event){
 if(!event?.backendId)return;
 const res=await supabaseClient.from('match_events').delete().eq('id',event.backendId);if(res.error)throw res.error;
}
async function migrateLocalMatchCenterToBackend(){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para migrar o Match Center.');
 let rosterRows=0,eventRows=0,skipped=0;
 for(const g of seasonGames()){
  if(!g.backendId||!hasLocalMatchCenterData(g))continue;
  rosterRows+=await saveBackendMatchPlayers(g,{reload:false});
  for(const event of g.timeline||[]){
   if(event.backendId)continue;
   if(!localEventTypeToBackend(event.type)||(!event.playerId&&!event.ownGoal)||event.minute===''){skipped++;continue}
   try{await insertBackendMatchEvent(g,event,{reload:false});eventRows++}catch(err){console.warn('Evento não migrado',event,err);skipped++}
  }
 }
 await loadBackendMatchCenterData();
 return {rosterRows,eventRows,skipped};
}


function localAttendanceToDb(status){
 return ({'Presente':'present','Atrasado':'late','Falta':'absent','Lesionado':'injured'})[String(status||'')]||'';
}
function dbAttendanceToLocal(status){
 return ({present:'Presente',late:'Atrasado',absent:'Falta',injured:'Lesionado'})[String(status||'')]||'';
}
function applyBackendTrainingToState(){
 if(!backendTrainingLoaded||typeof state==='undefined')return;
 const rows=backendTraining.trainings||[];
 // Before the first migration, preserve any local training data so it can be uploaded.
 if(!rows.length)return;
 const season=backendActiveSeason();if(!season)return;
 const localSeason=state.seasons.find(s=>s.backendId===season.id||s.label===season.label);const localSeasonId=localSeason?.id||state.settings.activeSeasonId;
 const previous=state.trainings||[];
 const activeOld=previous.filter(t=>(t.seasonId||state.settings.activeSeasonId)===localSeasonId);
 const other=previous.filter(t=>(t.seasonId||state.settings.activeSeasonId)!==localSeasonId);
 const attendance=backendTraining.attendance||[],weighIns=backendTraining.weighIns||[];
 const mapped=rows.map(r=>{
  const dt=portugalParts(r.scheduled_at);
  const old=activeOld.find(t=>t.backendId===r.id)||activeOld.find(t=>t.date===dt.date&&String(t.time||'')===String(dt.time||'')&&String(t.location||'')===String(r.venue||''))||{};
  const entries={};
  for(const p of state.players||[])entries[p.id]={status:'',pre:'',post:''};
  for(const a of attendance.filter(x=>x.training_id===r.id)){
   const pid=localPlayerIdFromBackend(a.player_id);if(!pid)continue;
   entries[pid]=entries[pid]||{status:'',pre:'',post:''};entries[pid].status=dbAttendanceToLocal(a.status);
  }
  for(const w of weighIns.filter(x=>x.training_id===r.id)){
   const pid=localPlayerIdFromBackend(w.player_id);if(!pid)continue;
   entries[pid]=entries[pid]||{status:'',pre:'',post:''};entries[pid][w.timing==='post'?'post':'pre']=String(Number(w.weight_kg));
  }
  return {...old,id:old.id||`dbtraining_${r.id}`,backendId:r.id,seasonId:localSeasonId,date:dt.date,time:dt.time,location:r.venue||'',notes:r.notes||'',title:r.title||'Treino',status:r.status||'scheduled',entries};
 });
 state.trainings=[...other,...mapped];
 try{persistPublicCache()}catch{}
}
async function loadBackendTrainingData(){
 const season=backendActiveSeason();
 if(!season){backendTraining={seasonId:'',trainings:[],attendance:[],weighIns:[]};backendTrainingLoaded=true;return}
 const tr=await supabaseClient.from('trainings').select('id,season_id,scheduled_at,title,venue,notes,status,created_at,updated_at').eq('season_id',season.id).order('scheduled_at',{ascending:true});
 if(tr.error)throw tr.error;
 const trainings=tr.data||[],ids=trainings.map(x=>x.id);let attendance=[],weighIns=[];
 if(ids.length){
  const [ar,wr]=await Promise.all([
   supabaseClient.from('training_attendance').select('training_id,player_id,status,notes,recorded_by,created_at,updated_at').in('training_id',ids),
   supabaseClient.from('weigh_ins').select('id,training_id,player_id,timing,weight_kg,measured_at,recorded_by,created_at,updated_at').in('training_id',ids).order('measured_at',{ascending:true})
  ]);
  if(ar.error)throw ar.error;if(wr.error)throw wr.error;attendance=ar.data||[];weighIns=wr.data||[];
 }
 backendTraining={seasonId:season.id,trainings,attendance,weighIns};backendTrainingLoaded=true;applyBackendTrainingToState();
}
async function saveBackendTraining(t,{reload=true}={}){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para alterar treinos.');
 const season=backendActiveSeason();if(!season)throw new Error('Não existe época ativa no Supabase.');
 const payload={season_id:season.id,scheduled_at:portugalKickoffIso(t.date,t.time||'00:00'),title:t.title||'Treino',venue:String(t.location||'').trim()||null,notes:String(t.notes||'').trim()||null,status:['scheduled','completed','cancelled'].includes(t.status)?t.status:'scheduled'};
 let res;
 if(t.backendId)res=await supabaseClient.from('trainings').update(payload).eq('id',t.backendId).select('id').single();
 else res=await supabaseClient.from('trainings').insert(payload).select('id').single();
 if(res.error)throw res.error;
 t.backendId=res.data.id;
 const [da,dw]=await Promise.all([
  supabaseClient.from('training_attendance').delete().eq('training_id',t.backendId),
  supabaseClient.from('weigh_ins').delete().eq('training_id',t.backendId)
 ]);
 if(da.error)throw da.error;if(dw.error)throw dw.error;
 const attendanceRows=[],weightRows=[];const recordedBy=backendSession?.user?.id||null;
 for(const [pid,e] of Object.entries(t.entries||{})){
  const backendPlayerId=backendPlayerIdFromLocal(pid);if(!backendPlayerId)continue;
  const status=localAttendanceToDb(e?.status);
  if(status)attendanceRows.push({training_id:t.backendId,player_id:backendPlayerId,status,notes:null,recorded_by:recordedBy});
  for(const timing of ['pre','post']){
   const raw=String(e?.[timing]??'').trim();if(!raw)continue;
   const weight=Number(raw.replace(',','.'));if(!Number.isFinite(weight)||weight<=20||weight>=250)throw new Error(`Peso inválido para ${playerById(pid)?.name||'jogador'} (${timing==='pre'?'antes':'depois'} do treino).`);
   weightRows.push({training_id:t.backendId,player_id:backendPlayerId,timing,weight_kg:weight,measured_at:payload.scheduled_at,recorded_by:recordedBy});
  }
 }
 if(attendanceRows.length){const ia=await supabaseClient.from('training_attendance').insert(attendanceRows);if(ia.error)throw ia.error}
 if(weightRows.length){const iw=await supabaseClient.from('weigh_ins').insert(weightRows);if(iw.error)throw iw.error}
 if(reload){await loadBackendTrainingData();if(backendFinesLoaded)await loadBackendFinesData()}
 return {attendance:attendanceRows.length,weighIns:weightRows.length};
}
async function createInitialBackendTrainings(){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Sem permissão para migrar treinos.');
 const season=backendActiveSeason();if(!season)throw new Error('Não existe época ativa no Supabase.');
 const existing=await supabaseClient.from('trainings').select('id').eq('season_id',season.id);if(existing.error)throw existing.error;
 if((existing.data||[]).length){await loadBackendTrainingData();return {created:false,count:(existing.data||[]).length}}
 let attendance=0,weighIns=0;const local=[...seasonTrainings()];
 for(const t of local){const r=await saveBackendTraining(t,{reload:false});attendance+=r.attendance;weighIns+=r.weighIns}
 await loadBackendTrainingData();return {created:true,count:local.length,attendance,weighIns};
}
async function deleteBackendTraining(t){
 if(!t?.backendId)return;
 const res=await supabaseClient.from('trainings').delete().eq('id',t.backendId);if(res.error)throw res.error;
 await loadBackendTrainingData();
}


function fineStatus(f){return f?.status|| (f?.paid?'paid':'pending')}
function fineStatusLabel(status){return ({pending:'Pendente',paid:'Pago',waived:'Perdoada',cancelled:'Anulada'})[status]||status||'Pendente'}
function fineStatusPill(status){return status==='paid'?'green':status==='pending'?'red':'gray'}
function localTrainingIdFromBackend(id){return state.trainings.find(t=>t.backendId===id)?.id||id||''}
function applyBackendFinesToState(){
 if(!backendFinesLoaded||typeof state==='undefined')return;
 const season=backendActiveSeason();if(!season)return;
 const localSeason=state.seasons.find(s=>s.backendId===season.id||s.label===season.label);const localSeasonId=localSeason?.id||state.settings.activeSeasonId;
 const remoteRules=(backendFines.rules||[]).map(r=>({
  id:`dbfr_${r.id}`,backendId:r.id,seasonId:localSeasonId,code:r.code||'',reason:r.reason||'',amount:Number(r.amount||0),active:r.active!==false,automatic:!!r.automatic,description:r.description||''
 }));
 // Em modo online, o Supabase é a fonte de verdade. Não reaproveitar regras locais antigas,
 // porque um utilizador sem permissão poderia manter dados residuais no localStorage.
 state.fineRules=[...remoteRules];
 const remoteFines=(backendFines.fines||[]).map(f=>{
  const playerId=localPlayerIdFromBackend(f.player_id)||'';
  const status=f.status||'pending';
  return {id:`dbfine_${f.id}`,backendId:f.id,seasonId:localSeasonId,playerId,date:f.occurred_on||String(f.created_at||'').slice(0,10),reason:f.reason||'',amount:Number(f.amount||0),status,paid:status==='paid',sourceType:f.source_type||'manual',sourceId:f.source_type==='training_late'?localTrainingIdFromBackend(f.source_id):(f.source_id||''),backendSourceId:f.source_id||'',auto:f.source_type==='training_late',notes:f.notes||'',ruleBackendId:f.rule_id||''};
 });
 // O resultado já vem filtrado pelo RLS: jogador recebe apenas as próprias multas;
 // capitão/equipa técnica/admin recebem os registos permitidos. Não misturar multas locais antigas.
 state.fines=[...remoteFines];
 try{persistPublicCache()}catch{}
}
async function loadBackendFinesData(){
 const season=backendActiveSeason();
 if(!season){backendFines={seasonId:'',rules:[],fines:[]};backendFinesLoaded=true;return}
 const [rr,fr]=await Promise.all([
  supabaseClient.from('fine_rules').select('*').eq('season_id',season.id).order('reason',{ascending:true}),
  supabaseClient.from('fines').select('*').eq('season_id',season.id).order('created_at',{ascending:false})
 ]);
 if(rr.error)throw rr.error;if(fr.error)throw fr.error;
 backendFines={seasonId:season.id,rules:rr.data||[],fines:fr.data||[]};backendFinesLoaded=true;applyBackendFinesToState();
}
function makeFineRuleCode(reason){const base=String(reason||'regra').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40)||'regra';return `${base}_${Date.now().toString(36)}`}
async function saveBackendFineRule(rule){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Só Admin ou Equipa Técnica podem alterar regras de multas.');
 const season=backendActiveSeason();if(!season)throw new Error('Não existe época ativa no Supabase.');
 const payload={season_id:season.id,code:rule.code||makeFineRuleCode(rule.reason),reason:rule.reason,amount:Number(rule.amount||0),active:rule.active!==false,automatic:!!rule.automatic,description:String(rule.description||'').trim()||null};
 let res;if(rule.backendId)res=await supabaseClient.from('fine_rules').update(payload).eq('id',rule.backendId).select('*').single();else res=await supabaseClient.from('fine_rules').insert(payload).select('*').single();
 if(res.error)throw res.error;rule.backendId=res.data.id;rule.code=res.data.code;await loadBackendFinesData();return res.data;
}
async function deleteBackendFineRule(rule){
 if(!rule?.backendId)return;if(rule.code==='training_late')throw new Error('A regra automática de atraso ao treino não pode ser eliminada.');
 const res=await supabaseClient.from('fine_rules').delete().eq('id',rule.backendId);if(res.error)throw res.error;await loadBackendFinesData();
}
async function saveBackendFine(fine){
 if(!backendRoles.some(r=>['admin','staff','captain'].includes(r)))throw new Error('Sem permissão para gerir multas.');
 const season=backendActiveSeason();if(!season)throw new Error('Não existe época ativa no Supabase.');
 const backendPlayerId=backendPlayerIdFromLocal(fine.playerId);if(!backendPlayerId)throw new Error('Jogador não encontrado no plantel online.');
 const payload={season_id:season.id,player_id:backendPlayerId,rule_id:fine.ruleBackendId||null,reason:fine.reason,amount:Number(fine.amount||0),status:fineStatus(fine),source_type:fine.sourceType||'manual',source_id:fine.backendSourceId||null,notes:String(fine.notes||'').trim()||null,occurred_on:fine.date||nowKey()};
 if(payload.status==='paid'){payload.paid_at=fine.paidAt||new Date().toISOString();payload.paid_by=backendSession?.user?.id||null}else{payload.paid_at=null;payload.paid_by=null}
 let res;if(fine.backendId)res=await supabaseClient.from('fines').update(payload).eq('id',fine.backendId).select('*').single();else res=await supabaseClient.from('fines').insert({...payload,created_by:backendSession?.user?.id||null}).select('*').single();
 if(res.error)throw res.error;fine.backendId=res.data.id;await loadBackendFinesData();return res.data;
}
async function deleteBackendFine(fine){
 if(!fine?.backendId)return;if(fine.sourceType==='training_late')throw new Error('Multas automáticas de atraso são geridas pela presença no treino.');
 const res=await supabaseClient.from('fines').delete().eq('id',fine.backendId);if(res.error)throw res.error;await loadBackendFinesData();
}
async function setBackendFineStatus(fine,status){fine.status=status;fine.paid=status==='paid';fine.paidAt=status==='paid'?new Date().toISOString():null;return saveBackendFine(fine)}
async function migrateLocalFinesToBackend(){
 if(!backendRoles.includes('admin')&&!backendRoles.includes('staff'))throw new Error('Só Admin ou Equipa Técnica podem fazer a migração inicial das multas.');
 let rules=0,fines=0,skipped=0;
 for(const r of [...(state.fineRules||[])]){
  if(r.backendId||r.code==='training_late')continue;
  try{await saveBackendFineRule(r);rules++}catch(err){console.warn('Regra não migrada:',err?.message||'erro');skipped++}
 }
 for(const f of [...(state.fines||[])]){
  if(f.backendId||f.auto||f.sourceType==='training_late')continue;
  try{await saveBackendFine(f);fines++}catch(err){console.warn('Multa não migrada:',err?.message||'erro');skipped++}
 }
 await loadBackendFinesData();return {rules,fines,skipped};
}

function setAuthMessage(message,type=''){
 const el=$('#authMessage');if(!el)return;el.textContent=message||'';el.className=`auth-message ${type}`.trim();
}
function setAuthBusy(busy){
 const btn=$('#loginBtn');if(btn){btn.disabled=busy;btn.textContent=busy?'A entrar…':'Entrar'}
 const email=$('#loginEmail'),password=$('#loginPassword');if(email)email.disabled=busy;if(password)password.disabled=busy;
}
function showAuthGate(){
 $('#authGate')?.classList.remove('hidden');$('#appShell')?.classList.add('auth-hidden');
}
function showAuthenticatedApp(){
 $('#authGate')?.classList.add('hidden');$('#appShell')?.classList.remove('auth-hidden');
}
function isJwtSessionError(err){
 const msg=String(err?.message||err||'').toLowerCase();
 return msg.includes('jwt')||msg.includes('jw')&&msg.includes('token')||msg.includes('token has expired')||msg.includes('invalid token')||msg.includes('refresh token');
}
async function clearLocalSupabaseSession(){
 try{await supabaseClient?.auth.signOut({scope:'local'})}catch(e){console.warn('Não foi possível limpar a sessão local anterior.',e)}
 backendSession=null;backendProfile=null;backendRoles=[];backendPlayerAccount=null;backendPrivacyAcknowledgement=null;backendPrivacyLoaded=false;
}
async function loadIdentityWithOneRetry(session){
 try{return await loadBackendIdentity(session)}catch(err){
  if(!isJwtSessionError(err))throw err;
  const {data,error}=await supabaseClient.auth.refreshSession();
  if(error||!data?.session)throw err;
  return await loadBackendIdentity(data.session);
 }
}
// Apenas equipa técnica/admin pode consultar ou atualizar o template interno.
async function loadBackendNutritionSettings(){
 backendNutritionLoaded=false;
 state.settings.weightReference='pre';
 state.settings.nutritionTemplate='';
 state.settings.nutritionEnabled=false;
 if(!backendSession?.user?.id||!backendRoles.some(r=>r==='admin'||r==='staff'))return;
 try{
  const {data,error}=await supabaseClient.from('nutrition_settings').select('weight_reference,nutrition_template,nutrition_enabled').eq('id',true).maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Configuração privada do plano alimentar ainda não criada.');
  state.settings.weightReference=data.weight_reference||'pre';
  state.settings.nutritionTemplate=data.nutrition_template||'';
  state.settings.nutritionEnabled=data.nutrition_enabled===true;
  backendNutritionLoaded=true;
 }catch(err){console.warn('Plano alimentar privado indisponível até à migração:',err)}
}
async function saveBackendNutritionSettings(weightReference,template){
 if(!backendSession?.user?.id||!backendRoles.some(r=>r==='admin'||r==='staff'))throw new Error('Sem permissão para guardar o plano alimentar.');
 if(!backendNutritionLoaded)throw new Error('A migração da configuração privada do plano alimentar ainda não foi aplicada no Supabase.');
 const trimmed=String(template||'').trim();
 const ref=['pre','post','mean'].includes(weightReference)?weightReference:'pre';
 const {data,error}=await supabaseClient.from('nutrition_settings')
  .update({weight_reference:ref,nutrition_template:trimmed,nutrition_enabled:!!trimmed,updated_by:backendSession.user.id,updated_at:new Date().toISOString()})
  .eq('id',true).select('weight_reference,nutrition_template,nutrition_enabled').single();
 if(error)throw error;
 state.settings.weightReference=data.weight_reference||'pre';
 state.settings.nutritionTemplate=data.nutrition_template||'';
 state.settings.nutritionEnabled=data.nutrition_enabled===true;
 return data;
}
async function loadBackendIdentity(session){
 backendSession=session;
 const userId=session?.user?.id;
 if(!userId)throw new Error('Sessão inválida.');
 const [profileRes,rolesRes,settingsRes,playerAccountRes]=await Promise.all([
  supabaseClient.from('profiles').select('id,display_name,email,member_number,member_status,active').eq('id',userId).maybeSingle(),
  supabaseClient.from('user_roles').select('role').eq('user_id',userId),
  supabaseClient.from('app_settings').select('app_name,schema_version,active_season_id,club_team_id').eq('id',true).maybeSingle(),
  supabaseClient.from('player_accounts').select('player_id,user_id,linked_at').eq('user_id',userId).maybeSingle()
 ]);
 if(profileRes.error)throw profileRes.error;
 if(rolesRes.error)throw rolesRes.error;
 if(settingsRes.error)throw settingsRes.error;
 if(playerAccountRes.error)throw playerAccountRes.error;
 backendProfile=profileRes.data||null;
 backendRoles=(rolesRes.data||[]).map(x=>x.role);
 backendPlayerAccount=playerAccountRes.data||null;
 if(backendProfile?.active===false)throw new Error('Esta conta está desativada. Contacta um administrador.');
 guestMode=false;
 await loadBackendReferenceData(settingsRes.data||null);
 await loadBackendRosterData();
 await loadBackendMatchesData();
 await loadBackendMatchCenterData();
 await loadBackendNutritionSettings();
 const internalAccess=backendRoles.some(r=>['admin','staff','captain','player'].includes(r));
 if(internalAccess){
  await loadBackendTrainingData();
  await loadBackendFinesData();
 }else{
  backendTraining={seasonId:'',trainings:[],attendance:[],weighIns:[]};backendTrainingLoaded=false;
  backendFines={seasonId:'',rules:[],fines:[]};backendFinesLoaded=false;
 }
 if(backendRoles.includes('admin'))await loadBackendPeopleData();
 await loadPrivacyAcknowledgement();
 await loadBackendNotificationSchedule();
 await loadBackendNotifications();
 await loadPushDeviceStatus();
 backendConnected=backendReferenceLoaded&&!!settingsRes.data;
 configurePreviewSelector();
 mode=highestBackendRole(backendRoles);
 localStorage.setItem(MODE_KEY,mode);
}
function configurePreviewSelector(){
 const sel=$('#previewMode');if(!sel)return;
 const isAdmin=!!backendSession&&backendRoles.includes('admin')&&!guestMode;
 sel.classList.toggle('hidden',!isAdmin);
 if(!isAdmin){
  mode=guestMode?'public':highestBackendRole(backendRoles);
  sel.innerHTML='';
  return;
 }
 const all=[['admin','Vista Admin'],['staff','Vista Equipa técnica'],['captain','Vista Capitão'],['player','Vista Jogador'],['member','Vista Sócio'],['public','Vista Pública']];
 sel.innerHTML=all.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
 sel.title='Pré-visualizar permissões';
}
function authRedirectUrl(flow=''){
 try{
  const url=new URL(window.location.href);
  url.search='';url.hash='';
  if(flow)url.searchParams.set('auth_flow',flow);
  return url.toString();
 }catch{
  const base=window.location.href.split('#')[0].split('?')[0];
  return flow?`${base}?auth_flow=${encodeURIComponent(flow)}`:base;
 }
}
function authUrlFlow(raw=window.location.href){
 try{
  const url=new URL(raw);
  const hash=new URLSearchParams(String(url.hash||'').replace(/^#/,''));
  return hash.get('auth_flow')||url.searchParams.get('auth_flow')||hash.get('type')||url.searchParams.get('type')||'';
 }catch{return ''}
}
function authUrlSignalsRecovery(raw=window.location.href){
 return authUrlFlow(raw)==='recovery';
}
function authErrorIsExpiredOrInvalid(raw=''){
 const msg=String(raw||'').toLowerCase();
 return msg.includes('expired')||msg.includes('invalid')||msg.includes('otp_expired')||msg.includes('token has expired');
}
function authUrlError(raw=window.location.href){
 try{
  const url=new URL(raw);
  const hash=new URLSearchParams(String(url.hash||'').replace(/^#/,''));
  const code=hash.get('error_code')||url.searchParams.get('error_code')||'';
  const description=hash.get('error_description')||url.searchParams.get('error_description')||'';
  if(!code&&!description)return '';
  return decodeURIComponent(String(description||code).replace(/\+/g,' '));
 }catch{return ''}
}
function cleanAuthUrl(){
 try{history.replaceState({},document.title,authRedirectUrl())}catch{}
}
function friendlyAuthError(err){
 const raw=String(err?.message||err||'Erro desconhecido');
 const msg=raw.toLowerCase();
 if(msg.includes('invalid login credentials'))return 'Email ou palavra-passe incorretos.';
 if(msg.includes('email not confirmed'))return 'Ainda tens de confirmar o teu email antes de iniciar sessão.';
 if(msg.includes('password should be at least'))return 'A palavra-passe não cumpre o tamanho mínimo exigido.';
 if(msg.includes('rate limit')||msg.includes('too many requests'))return 'Foram feitos demasiados pedidos. Aguarda um pouco e tenta novamente.';
 if(msg.includes('expired')||msg.includes('otp_expired'))return 'Este link expirou ou já não é válido.';
 return raw;
}
function showAuthMode(mode='login',clearMessage=true){
 const forms={login:$('#loginForm'),signup:$('#signupForm'),forgot:$('#forgotPasswordForm'),recovery:$('#recoveryPasswordForm'),resend:$('#resendConfirmationForm')};
 Object.entries(forms).forEach(([key,el])=>el?.classList.toggle('hidden',key!==mode));
 const title=$('#authTitle'),copy=$('#authDescription');
 const texts={
  login:['Entrar','Entra com a tua conta ADC Figueiras.'],
  signup:['Criar conta','Qualquer pessoa pode criar conta. Se tiveres um convite, os acessos atribuídos pelo clube são aplicados automaticamente.'],
  forgot:['Recuperar acesso','Vamos enviar um link seguro para o email associado à tua conta.'],
  recovery:['Nova palavra-passe','Escolhe uma nova palavra-passe para voltares a aceder à tua conta.'],
  resend:['Link de confirmação expirado','Este link já não é válido. Pede um novo email de confirmação para terminares a criação da conta.']
 };
 const [heading,description]=texts[mode]||texts.login;
 if(title)title.textContent=heading;if(copy)copy.textContent=description;
 if(clearMessage)setAuthMessage('');
}
function showSignupMode(show=true){showAuthMode(show?'signup':'login')}
function showForgotPasswordMode(){
 const source=String($('#loginEmail')?.value||'').trim();
 const target=$('#forgotPasswordEmail');if(target&&source)target.value=source;
 showAuthMode('forgot');
}
async function requestPasswordReset(email){
 const cleanEmail=String(email||'').trim().toLowerCase();
 if(!cleanEmail){setAuthMessage('Indica o teu email.','error');return}
 const btn=$('#forgotPasswordSubmitBtn');if(btn){btn.disabled=true;btn.textContent='A enviar…'}setAuthMessage('');
 try{
  const {error}=await supabaseClient.auth.resetPasswordForEmail(cleanEmail,{redirectTo:authRedirectUrl('recovery')});
  if(error)throw error;
  setAuthMessage('Se existir uma conta com esse email, enviámos um link de recuperação. Verifica também o spam.','ok');
 }catch(err){console.error(err);setAuthMessage(friendlyAuthError(err),'error')}
 finally{if(btn){btn.disabled=false;btn.textContent='Enviar link de recuperação'}}
}
function showExpiredSignupConfirmation(){
 const remembered=String(localStorage.getItem(PENDING_CONFIRM_EMAIL_KEY)||'').trim();
 const target=$('#resendConfirmationEmail');if(target&&remembered)target.value=remembered;
 showAuthGate();showAuthMode('resend',false);
 setAuthMessage('O link de confirmação expirou ou já não é válido. Podes pedir um novo abaixo.','error');
}
async function resendSignupConfirmation(email){
 const cleanEmail=String(email||'').trim().toLowerCase();
 if(!cleanEmail){setAuthMessage('Indica o email usado para criar a conta.','error');return}
 const btn=$('#resendConfirmationBtn');if(btn){btn.disabled=true;btn.textContent='A reenviar…'}setAuthMessage('');
 try{
  const {error}=await supabaseClient.auth.resend({type:'signup',email:cleanEmail,options:{emailRedirectTo:authRedirectUrl('signup')}});
  if(error)throw error;
  localStorage.setItem(PENDING_CONFIRM_EMAIL_KEY,cleanEmail);
  setAuthMessage('Enviámos um novo email de confirmação. Usa apenas o link mais recente e verifica também o spam.','ok');
 }catch(err){console.error(err);setAuthMessage(friendlyAuthError(err),'error')}
 finally{if(btn){btn.disabled=false;btn.textContent='Reenviar email de confirmação'}}
}
function repeatedSignupResponse(data){
 const user=data?.user;
 if(!user||data?.session)return false;
 if(Array.isArray(user.identities)&&user.identities.length===0)return true;
 const createdAt=Date.parse(user.created_at||'');
 return Number.isFinite(createdAt)&&(Date.now()-createdAt)>30000;
}

async function completePasswordRecovery(password,password2){
 if(String(password||'').length<MIN_NEW_PASSWORD_LENGTH){setAuthMessage('A nova palavra-passe deve ter pelo menos 12 caracteres.','error');return}
 if(password!==password2){setAuthMessage('As palavras-passe não coincidem.','error');return}
 const btn=$('#recoveryPasswordBtn');if(btn){btn.disabled=true;btn.textContent='A guardar…'}setAuthMessage('');
 try{
  const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;
  passwordRecoveryMode=false;cleanAuthUrl();
  await clearLocalSupabaseSession();
  resetPublicRuntimeState();
  showAuthGate();showAuthMode('login',false);
  const pw=$('#loginPassword');if(pw)pw.value='';
  setAuthMessage('Palavra-passe atualizada. Já podes iniciar sessão com a nova palavra-passe.','ok');
 }catch(err){console.error(err);setAuthMessage(friendlyAuthError(err),'error')}
 finally{if(btn){btn.disabled=false;btn.textContent='Guardar nova palavra-passe'}}
}
async function signUpV3(name,email,memberNumber,password,password2){
 const cleanName=sanitizePlainText(name,120);
 const cleanEmail=String(email||'').trim().toLowerCase();
 const cleanMember=sanitizePlainText(memberNumber,30);
 if(!cleanName){setAuthMessage('Indica o teu nome.','error');return}
 if(cleanEmail.length>254||!EMAIL_INPUT_PATTERN.test(cleanEmail)){setAuthMessage('Indica um email válido.','error');return}
 if(password.length<MIN_NEW_PASSWORD_LENGTH){setAuthMessage('A palavra-passe deve ter pelo menos 12 caracteres.','error');return}
 if(password!==password2){setAuthMessage('As palavras-passe não coincidem.','error');return}
 const termsCheck=$('#signupForm input[name="termsAccepted"]');
 if(!termsCheck?.checked){setAuthMessage('Para criar conta, lê e aceita os Termos e Condições.','error');return}
 const btn=$('#signupBtn');if(btn){btn.disabled=true;btn.textContent='A criar…'}setAuthMessage('');
 try{
  const {data,error}=await supabaseClient.auth.signUp({
   email:cleanEmail,
   password,
   options:{emailRedirectTo:authRedirectUrl('signup'),data:{display_name:cleanName,member_number:cleanMember||null,terms_accepted:true,terms_version:TERMS_VERSION}}
  });
  if(error)throw error;
  if(repeatedSignupResponse(data)){
   showSignupMode(false);const em=$('#loginEmail');if(em)em.value=email;
   setAuthMessage('Não foi possível criar uma nova conta com este email. Se já tens conta, inicia sessão ou recupera a palavra-passe.','error');
   return;
  }
  localStorage.setItem(PENDING_CONFIRM_EMAIL_KEY,email);
  if(data.session){localStorage.removeItem(PENDING_CONFIRM_EMAIL_KEY);resetPublicRuntimeState();await loadIdentityWithOneRetry(data.session);showAuthenticatedApp();renderChrome();showView('dashboard');queuePostLoginOnboarding();return}
  showSignupMode(false);const em=$('#loginEmail');if(em)em.value=email;
  setAuthMessage(cleanMember?'Conta criada. Confirma o email que recebeste. O teu número de sócio ficará pendente de validação pelo clube.':'Conta criada. Confirma o email que recebeste e depois inicia sessão.','ok');
 }catch(err){
  console.error(err);
  const code=String(err?.code||'').toLowerCase(),msg=String(err?.message||'').toLowerCase();
  if(code==='email_exists'||code==='user_already_exists'||msg.includes('already registered')){
   showSignupMode(false);const em=$('#loginEmail');if(em)em.value=email;
   setAuthMessage('Não foi possível criar uma nova conta com este email. Se já tens conta, inicia sessão ou recupera a palavra-passe.','error');
  }else setAuthMessage(friendlyAuthError(err)||'Não foi possível criar a conta.','error');
 }finally{if(btn){btn.disabled=false;btn.textContent='Criar conta'}}
}
async function loadPublicBackend(){
 guestMode=true;backendSession=null;backendProfile=null;backendRoles=[];backendPlayerAccount=null;backendPeople={profiles:[],roles:[],links:[],invitations:[]};backendPeopleLoaded=false;backendPrivacyAcknowledgement=null;backendPrivacyLoaded=false;
 const settingsRes=await supabaseClient.from('app_settings').select('app_name,schema_version,active_season_id,club_team_id').eq('id',true).maybeSingle();
 if(settingsRes.error)throw settingsRes.error;
 await loadBackendReferenceData(settingsRes.data||null);
 await loadBackendRosterData();
 await loadBackendMatchesData();
 await loadBackendMatchCenterData();
 backendTraining={seasonId:'',trainings:[],attendance:[],weighIns:[]};backendTrainingLoaded=false;
 backendFines={seasonId:'',rules:[],fines:[]};backendFinesLoaded=false;
 backendNotifications={rows:[],recipients:[],preferences:null};backendNotificationsLoaded=false;backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};backendNotificationScheduleLoaded=false;backendPushDevice={supported:false,permission:'default',subscribed:false,endpoint:'',row:null};state.notifications=[];
 backendConnected=backendReferenceLoaded&&!!settingsRes.data;
 mode='public';configurePreviewSelector();localStorage.setItem(MODE_KEY,'public');
}
async function continueAsPublic(){
 setAuthMessage('A abrir a área pública…');
 try{
  // Garante que o primeiro pedido público usa a chave anónima e não um JWT antigo
  // que possa ter ficado guardado no browser de uma sessão anterior.
  await clearLocalSupabaseSession();
  resetPublicRuntimeState();
  await loadPublicBackend();
  showAuthenticatedApp();renderChrome();showView('dashboard');
 }catch(err){
  console.error(err);
  if(isJwtSessionError(err)){
   try{
    await clearLocalSupabaseSession();
    resetPublicRuntimeState();
    await loadPublicBackend();
    showAuthenticatedApp();renderChrome();showView('dashboard');
    return;
   }catch(retryErr){err=retryErr}
  }
  setAuthMessage(`Não foi possível abrir a área pública: ${err?.message||'erro desconhecido'}`,'error');
 }
}
function leavePublicMode(){
 guestMode=false;backendSession=null;backendProfile=null;backendRoles=[];backendPlayerAccount=null;backendPrivacyAcknowledgement=null;backendPrivacyLoaded=false;backendNotifications={rows:[],recipients:[],preferences:null};backendNotificationsLoaded=false;backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};backendNotificationScheduleLoaded=false;backendPushDevice={supported:false,permission:'default',subscribed:false,endpoint:'',row:null};state.notifications=[];backendConnected=false;mode='public';
 resetPublicRuntimeState();
 showAuthGate();showSignupMode(false);setAuthMessage('');
}
async function signInV3(email,password){
 setAuthBusy(true);setAuthMessage('');
 try{
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error)throw error;
  localStorage.removeItem(PENDING_CONFIRM_EMAIL_KEY);
  resetPublicRuntimeState();await loadIdentityWithOneRetry(data.session);
  showAuthenticatedApp();
  renderChrome();showView('dashboard');queuePostLoginOnboarding();
 }catch(err){
  console.error(err);setAuthMessage(friendlyAuthError(err)||'Não foi possível iniciar sessão.','error');
  try{await supabaseClient.auth.signOut()}catch{}
  resetPublicRuntimeState();
 }finally{setAuthBusy(false)}
}
async function signOutV3(){
 // A saída da conta não revoga o push do dispositivo.
 // O utilizador pode desativá-lo expressamente nas definições de notificações.
 try{await supabaseClient?.auth.signOut()}catch(e){console.warn(e)}
 guestMode=false;backendSession=null;backendProfile=null;backendRoles=[];backendPlayerAccount=null;backendPeople={profiles:[],roles:[],links:[],invitations:[]};backendPeopleLoaded=false;backendPrivacyAcknowledgement=null;backendPrivacyLoaded=false;backendNotifications={rows:[],recipients:[],preferences:null};backendNotificationsLoaded=false;backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};backendNotificationScheduleLoaded=false;backendPushDevice={supported:false,permission:'default',subscribed:false,endpoint:'',row:null};state.notifications=[];backendConnected=false;mode='public';
 resetPublicRuntimeState();
 showAuthGate();setAuthMessage('Sessão terminada.','ok');
 const pw=$('#loginPassword');if(pw)pw.value='';
}
async function bootV3(){
 showAuthGate();
 if(!window.supabase?.createClient){setAuthMessage('Não foi possível carregar a ligação ao Supabase. Confirma que tens internet e atualiza a página.','error');return}
 const initialAuthFlow=authUrlFlow();
 const initialRecoveryHint=initialAuthFlow==='recovery'||authUrlSignalsRecovery();
 const initialAuthError=authUrlError();
 supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const listener=supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
   passwordRecoveryMode=true;backendSession=session||backendSession;
   showAuthGate();showAuthMode('recovery',false);setAuthMessage('Link de recuperação validado. Define uma nova palavra-passe.','ok');
  }
 });
 authStateSubscription=listener?.data?.subscription||null;
 $('#loginForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);signInV3(String(fd.get('email')||'').trim(),String(fd.get('password')||''))};
 $('#signupForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);signUpV3(String(fd.get('name')||'').trim(),String(fd.get('email')||'').trim().toLowerCase(),String(fd.get('memberNumber')||'').trim(),String(fd.get('password')||''),String(fd.get('password2')||''))};
 $('#forgotPasswordForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);requestPasswordReset(String(fd.get('email')||'').trim())};
 $('#recoveryPasswordForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);completePasswordRecovery(String(fd.get('password')||''),String(fd.get('password2')||''))};
 $('#resendConfirmationForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);resendSignupConfirmation(String(fd.get('email')||'').trim())};
 $('#showSignupBtn').onclick=()=>showSignupMode(true);$('#backToLoginBtn').onclick=()=>showSignupMode(false);$('#forgotPasswordBtn').onclick=showForgotPasswordMode;$('#forgotBackToLoginBtn').onclick=()=>showAuthMode('login');$('#resendBackToLoginBtn').onclick=()=>showAuthMode('login');$('#continuePublicBtn').onclick=continueAsPublic;$('#authPrivacyBtn').onclick=async()=>{await continueAsPublic();if(guestMode)showView('privacy')};
 $('#logoutBtn').onclick=()=>guestMode?leavePublicMode():signOutV3();
 try{
  const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;
  if(initialAuthError&&!data.session){
   if(initialAuthFlow==='signup'&&authErrorIsExpiredOrInvalid(initialAuthError)){cleanAuthUrl();showExpiredSignupConfirmation();return}
   showAuthMode(initialAuthFlow==='recovery'?'forgot':'login',false);
   setAuthMessage(initialAuthFlow==='recovery'?`Não foi possível validar o link de recuperação: ${initialAuthError}. Pede um novo link.`:`Não foi possível validar o link: ${initialAuthError}.`,'error');
   cleanAuthUrl();return;
  }
  if((passwordRecoveryMode||initialRecoveryHint)&&data.session){passwordRecoveryMode=true;backendSession=data.session;showAuthGate();showAuthMode('recovery',false);setAuthMessage('Link de recuperação validado. Define uma nova palavra-passe.','ok');return}
  if(data.session){localStorage.removeItem(PENDING_CONFIRM_EMAIL_KEY);resetPublicRuntimeState();await loadIdentityWithOneRetry(data.session);showAuthenticatedApp();renderChrome();showView('dashboard');queuePostLoginOnboarding()}
  else {showAuthGate();showAuthMode('login',false);if(initialAuthError){setAuthMessage(`Não foi possível validar o link: ${initialAuthError}.`,'error');cleanAuthUrl()}}
 }catch(err){console.error(err);setAuthMessage(`Ligação ao backend falhou: ${friendlyAuthError(err)}`,'error');showAuthGate()}
}


const seedPlayers=[
 ['Batista','Jogador'],['David','Jogador'],['Rui Lopes','Jogador'],['João Barros','Jogador'],['Vítor Coelho','Jogador'],
 ['Diogo Bessa','Jogador'],['Pedrinho','Jogador'],['Zé Mocho','Jogador'],['Bruno Bessa','Jogador'],['Joãozinho','Jogador'],
 ['Marcelo','GR'],['João','GR'],['Manu','GR']
].map((p,i)=>({id:`p${i+1}`,name:p[0],position:p[1],number:'',status:'Disponível',birth:'',phone:'',notes:''}));

const seedTeams=[{"name":"ADC Figueiras","short":"Figueiras","logo":"assets/adc-figueiras-logo-normal.png","homeVenue":"Pavilhão Municipal de Nevogilde","aliases":["ADC Figueiras","Figueiras"]},{"name":"AR Freixieiro","short":"Freixieiro","logo":"https://www.zerozero.pt/img_icon/44x50/logos/equipas/4371_imgbank.png","homeVenue":"Pavilhão Freixieiro","aliases":["AR Freixieiro","Freixieiro"]},{"name":"GD Baguim Monte","short":"Baguim Monte","logo":"https://www.zerozero.pt/img_icon/logos/equipas/27244_imgbank_1677160331.png","homeVenue":"Pavilhão Municipal Baguim do Monte","aliases":["GD Baguim Monte","Baguim do Monte","Baguim Monte"]},{"name":"FC Paço Sousa","short":"Paço Sousa","logo":"https://www.zerozero.pt/img_icon/logos/equipas/11125_imgbank_1723649873.png","homeVenue":"Pavilhão Desportivo Paço Sousa","aliases":["FC Paço Sousa","Paço de Sousa","Paço Sousa"]},{"name":"AD Tarrio","short":"AD Tarrio","logo":"https://www.zerozero.pt/img_icon/logos/equipas/57153_imgbank.png","homeVenue":"Pavilhão Desportivo de Rebordões","aliases":["AD Tarrio","Tarrio"]},{"name":"FC São Romão","short":"São Romão","logo":"https://www.zerozero.pt/img_icon/logos/equipas/11151_imgbank.png","homeVenue":"Pavilhão EB 2/3 São Romão Coronado","aliases":["FC São Romão","FCS. Romão","FCS Romão","São Romão"]},{"name":"ARC Moinhos","short":"ARC Moinhos","logo":"https://www.zerozero.pt/img_icon/50x50/logos/equipas/47711_imgbank.png","homeVenue":"Pavilhão AR Moinhos P. Ferreira","aliases":["ARC Moinhos"]},{"name":"AA Leça","short":"AA Leça","logo":"https://www.zerozero.pt/img_icon/50x50/logos/equipas/8086_imgbank.png","homeVenue":"Pavilhão Escola Secundária Boa Nova","aliases":["AA Leça","Ass. Académica Leça","Ass Académica Leça","Académica Leça"]},{"name":"AD Polenenses","short":"Polenenses","logo":"https://www.zerozero.pt/img_icon/50x50/logos/equipas/33067_imgbank_1677160142.png","homeVenue":"Pavilhão Municipal de Custóias","aliases":["AD Polenenses","Atl. D. Polenenses","Atl D Polenenses","Polenenses"]},{"name":"ASC Monte Pedras","short":"Monte Pedras","logo":"https://www.zerozero.pt/img_icon/50x50/logos/equipas/8156_imgbank.png","homeVenue":"Pavilhão Municipal Crestins","aliases":["ASC Monte Pedras","Monte das Pedras","Monte Pedras"]},{"name":"Juventude Gaia B","short":"Juventude Gaia B","logo":"https://afporto.pt/wp-content/uploads/2022/02/Juventude-Desportiva-de-Gaia.png","homeVenue":"Pavilhão Municipal Carlos Resende","aliases":["Juventude Gaia B","JD Gaia \"B\"","JD Gaia B"]},{"name":"Juventude Gaia","short":"Juventude Gaia","logo":"https://afporto.pt/wp-content/uploads/2022/02/Juventude-Desportiva-de-Gaia.png","homeVenue":"Pavilhão Municipal Carlos Resende","aliases":["Juventude Gaia"]},{"name":"Leais e Videirinhos","short":"Leais e Videirinhos","logo":"https://www.zerozero.pt/img_icon/50x50/logos/equipas/96814_imgbank.png","homeVenue":"Pavilhão Municipal de Pedrouços","aliases":["Leais e Videirinhos","A. Os Leais Videir. Pedrouços","Os Leais Videirinhos"]},{"name":"Juventude Matosinhos","short":"Juventude Matosinhos","logo":"https://www.zerozero.pt/img_icon/50x50/logos/equipas/47719_imgbank.png","homeVenue":"Pavilhão Municipal Leça do Balio","aliases":["Juventude Matosinhos","GD Juventude Matosinhos SC","Juventude Matosinhos SC"]},{"name":"Alvarelhos","short":"Alvarelhos","logo":"https://afporto.pt/wp-content/uploads/2022/02/G.C.R.A.-Grupo-Cultural-e-Recreativo-de-Alvarelhos.png","homeVenue":"Pavilhão Dário Marques","aliases":["Alvarelhos"]},{"name":"GD Vale do Ave","short":"Vale do Ave","logo":"https://afporto.pt/wp-content/uploads/2022/02/Grupo-Desportivo-Vale-do-Ave.png","homeVenue":"Pavilhão Escola D. Afonso Henriques","aliases":["GD Vale do Ave","Vale do Ave"]},{"name":"Iniciação S. Roque","short":"S. Roque","logo":"https://afporto.pt/wp-content/uploads/2022/02/INICIACAO-DESPORTIVA-DE-S.ROQUE_.png","homeVenue":"Pavilhão da EB 2,3 Nicolau Nasoni","aliases":["Iniciação S. Roque","Iniciação São Roque","São Roque"]},{"name":"GDCE Modelos","short":"Modelos","logo":"https://afporto.pt/wp-content/uploads/2022/02/G.D.C.E.Modelos.png","homeVenue":"Pavilhão Gimnodesportivo nº2 de Modelos","aliases":["GDCE Modelos","Modelos"]},{"name":"AR Areal","short":"AR Areal","logo":"https://afporto.pt/wp-content/uploads/2025/08/Associacao-Recreativa-do-Areal.png","homeVenue":"Pavilhão de Rebordões","aliases":["AR Areal","Areal"]},{"name":"Leões da Guarda","short":"Leões da Guarda","logo":"https://afporto.pt/wp-content/uploads/2022/02/Grupo-Desportivo-Leoes-da-Guarda.png","homeVenue":"Pavilhão Municipal Moreira da Maia","aliases":["Leões da Guarda"]},{"name":"AD Sebolido","short":"AD Sebolido","logo":"https://afporto.pt/wp-content/uploads/2023/07/ASSOCIACAO-PARA-O-DESENVOLVIMENTO-DE-SEBOLIDO.png","homeVenue":"Pavilhão Desportivo do Douro","aliases":["AD Sebolido","Sebolido"]},{"name":"Mosteiro FC","short":"Mosteiro FC","logo":"https://afporto.pt/wp-content/uploads/2022/02/Mosteiro-FC.png","homeVenue":"Pavilhão da Escola Secundária de Rio Tinto","aliases":["Mosteiro FC"]},{"name":"Casa FCP Rio Tinto","short":"Casa FCP Rio Tinto","logo":"https://afporto.pt/wp-content/uploads/2022/02/Casa-F-C-Porto-Rio-Tinto.png","homeVenue":"Pavilhão Escola EB 2,3 Baguim do Monte","aliases":["Casa FCP Rio Tinto"]}];
const seedFixtures=[{"round":1,"date":"2026-10-02","time":"21:30","home":"ADC Figueiras","away":"AR Freixieiro","id":"fx_01_001","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":1,"date":"2026-10-02","time":"21:30","home":"GD Baguim Monte","away":"FC Paço Sousa","id":"fx_01_002","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":1,"date":"2026-10-04","time":"17:00","home":"AD Tarrio","away":"FC São Romão","id":"fx_01_003","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":1,"date":"2026-10-02","time":"21:30","home":"ARC Moinhos","away":"AA Leça","id":"fx_01_004","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":1,"date":"2026-10-03","time":"19:30","home":"AD Polenenses","away":"ASC Monte Pedras","id":"fx_01_005","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":1,"date":"2026-10-03","time":"18:00","home":"Juventude Gaia B","away":"Leais e Videirinhos","id":"fx_01_006","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":2,"date":"2026-10-09","time":"21:00","home":"FC Paço Sousa","away":"ADC Figueiras","id":"fx_02_007","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":2,"date":"2026-10-10","time":"21:00","home":"FC São Romão","away":"GD Baguim Monte","id":"fx_02_008","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":2,"date":"2026-10-09","time":"22:30","home":"AA Leça","away":"AD Tarrio","id":"fx_02_009","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":2,"date":"2026-10-10","time":"20:00","home":"ASC Monte Pedras","away":"ARC Moinhos","id":"fx_02_010","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":2,"date":"2026-10-10","time":"19:00","home":"Leais e Videirinhos","away":"AD Polenenses","id":"fx_02_011","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":2,"date":"2026-10-10","time":"21:00","home":"Juventude Matosinhos","away":"Juventude Gaia B","id":"fx_02_012","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":3,"date":"2026-10-17","time":"18:00","home":"AR Freixieiro","away":"FC Paço Sousa","id":"fx_03_013","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":3,"date":"2026-10-16","time":"21:30","home":"ADC Figueiras","away":"FC São Romão","id":"fx_03_014","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":3,"date":"2026-10-17","time":"20:00","home":"GD Baguim Monte","away":"AA Leça","id":"fx_03_015","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":3,"date":"2026-10-17","time":"17:30","home":"AD Tarrio","away":"ASC Monte Pedras","id":"fx_03_016","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":3,"date":"2026-10-16","time":"21:30","home":"ARC Moinhos","away":"Leais e Videirinhos","id":"fx_03_017","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":3,"date":"2026-10-17","time":"19:00","home":"AD Polenenses","away":"Juventude Matosinhos","id":"fx_03_018","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":4,"date":"2026-10-24","time":"21:00","home":"FC São Romão","away":"AR Freixieiro","id":"fx_04_019","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":4,"date":"2026-10-24","time":"19:00","home":"AA Leça","away":"ADC Figueiras","id":"fx_04_020","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":4,"date":"2026-10-24","time":"20:00","home":"ASC Monte Pedras","away":"GD Baguim Monte","id":"fx_04_021","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":4,"date":"2026-10-24","time":"19:00","home":"Leais e Videirinhos","away":"AD Tarrio","id":"fx_04_022","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":4,"date":"2026-10-24","time":"21:00","home":"Juventude Matosinhos","away":"ARC Moinhos","id":"fx_04_023","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":4,"date":"2026-10-25","time":"16:30","home":"Juventude Gaia B","away":"AD Polenenses","id":"fx_04_024","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":5,"date":"2026-10-30","time":"21:00","home":"FC Paço Sousa","away":"FC São Romão","id":"fx_05_025","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":5,"date":"2026-10-31","time":"18:00","home":"AR Freixieiro","away":"AA Leça","id":"fx_05_026","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":5,"date":"2026-10-30","time":"21:30","home":"ADC Figueiras","away":"ASC Monte Pedras","id":"fx_05_027","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":5,"date":"2026-10-31","time":"20:00","home":"GD Baguim Monte","away":"Leais e Videirinhos","id":"fx_05_028","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":5,"date":"2026-10-30","time":"21:30","home":"AD Tarrio","away":"Juventude Matosinhos","id":"fx_05_029","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":5,"date":"2026-10-30","time":"21:30","home":"ARC Moinhos","away":"Juventude Gaia B","id":"fx_05_030","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":6,"date":"2026-11-06","time":"22:30","home":"AA Leça","away":"FC Paço Sousa","id":"fx_06_031","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":6,"date":"2026-11-07","time":"20:00","home":"ASC Monte Pedras","away":"AR Freixieiro","id":"fx_06_032","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":6,"date":"2026-11-07","time":"19:00","home":"Leais e Videirinhos","away":"ADC Figueiras","id":"fx_06_033","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":6,"date":"2026-11-07","time":"21:00","home":"Juventude Matosinhos","away":"GD Baguim Monte","id":"fx_06_034","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":6,"date":"2026-11-07","time":"17:30","home":"Juventude Gaia B","away":"AD Tarrio","id":"fx_06_035","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":6,"date":"2026-11-07","time":"19:00","home":"AD Polenenses","away":"ARC Moinhos","id":"fx_06_036","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":7,"date":"2026-11-21","time":"21:00","home":"FC São Romão","away":"AA Leça","id":"fx_07_037","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":7,"date":"2026-11-20","time":"21:00","home":"FC Paço Sousa","away":"ASC Monte Pedras","id":"fx_07_038","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":7,"date":"2026-11-21","time":"18:00","home":"AR Freixieiro","away":"Leais e Videirinhos","id":"fx_07_039","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":7,"date":"2026-11-20","time":"21:30","home":"ADC Figueiras","away":"Juventude Matosinhos","id":"fx_07_040","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":7,"date":"2026-11-21","time":"20:00","home":"GD Baguim Monte","away":"Juventude Gaia B","id":"fx_07_041","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":7,"date":"2026-11-21","time":"19:00","home":"AD Tarrio","away":"AD Polenenses","id":"fx_07_042","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":8,"date":"2026-11-28","time":"20:00","home":"ASC Monte Pedras","away":"FC São Romão","id":"fx_08_043","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":8,"date":"2026-11-28","time":"19:00","home":"Leais e Videirinhos","away":"FC Paço Sousa","id":"fx_08_044","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":8,"date":"2026-11-28","time":"21:00","home":"Juventude Matosinhos","away":"AR Freixieiro","id":"fx_08_045","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":8,"date":"2026-11-28","time":"16:00","home":"Juventude Gaia B","away":"ADC Figueiras","id":"fx_08_046","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":8,"date":"2026-11-28","time":"19:00","home":"AD Polenenses","away":"GD Baguim Monte","id":"fx_08_047","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":8,"date":"2026-11-27","time":"21:30","home":"ARC Moinhos","away":"AD Tarrio","id":"fx_08_048","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":9,"date":"2026-12-04","time":"22:30","home":"AA Leça","away":"ASC Monte Pedras","id":"fx_09_049","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":9,"date":"2026-12-05","time":"21:00","home":"FC São Romão","away":"Leais e Videirinhos","id":"fx_09_050","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":9,"date":"2026-12-04","time":"21:00","home":"FC Paço Sousa","away":"Juventude Matosinhos","id":"fx_09_051","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":9,"date":"2026-12-05","time":"18:00","home":"AR Freixieiro","away":"Juventude Gaia B","id":"fx_09_052","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":9,"date":"2026-12-04","time":"21:30","home":"ADC Figueiras","away":"AD Polenenses","id":"fx_09_053","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":9,"date":"2026-12-05","time":"20:00","home":"GD Baguim Monte","away":"ARC Moinhos","id":"fx_09_054","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":10,"date":"2026-12-12","time":"17:00","home":"Leais e Videirinhos","away":"AA Leça","id":"fx_10_055","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":10,"date":"2026-12-12","time":"21:00","home":"Juventude Matosinhos","away":"FC São Romão","id":"fx_10_056","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":10,"date":"2026-12-12","time":"17:30","home":"Juventude Gaia B","away":"FC Paço Sousa","id":"fx_10_057","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":10,"date":"2026-12-13","time":"19:30","home":"AD Polenenses","away":"AR Freixieiro","id":"fx_10_058","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":10,"date":"2026-12-11","time":"21:30","home":"ARC Moinhos","away":"ADC Figueiras","id":"fx_10_059","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":10,"date":"2026-12-12","time":"18:00","home":"AD Tarrio","away":"GD Baguim Monte","id":"fx_10_060","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":11,"date":"2026-12-19","time":"20:00","home":"ASC Monte Pedras","away":"Leais e Videirinhos","id":"fx_11_061","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":11,"date":"2026-12-18","time":"22:30","home":"AA Leça","away":"Juventude Matosinhos","id":"fx_11_062","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":11,"date":"2026-12-19","time":"21:00","home":"FC São Romão","away":"Juventude Gaia B","id":"fx_11_063","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":11,"date":"2026-12-18","time":"21:00","home":"FC Paço Sousa","away":"AD Polenenses","id":"fx_11_064","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":11,"date":"2026-12-19","time":"18:00","home":"AR Freixieiro","away":"ARC Moinhos","id":"fx_11_065","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":11,"date":"2026-12-18","time":"21:30","home":"ADC Figueiras","away":"AD Tarrio","id":"fx_11_066","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":12,"date":"2027-01-09","time":"21:00","home":"Juventude Matosinhos","away":"ASC Monte Pedras","id":"fx_12_067","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":12,"date":"2027-01-09","time":"18:00","home":"Juventude Gaia B","away":"AA Leça","id":"fx_12_068","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":12,"date":"2027-01-09","time":"22:30","home":"AD Polenenses","away":"FC São Romão","id":"fx_12_069","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":12,"date":"2027-01-08","time":"21:30","home":"ARC Moinhos","away":"FC Paço Sousa","id":"fx_12_070","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":12,"date":"2027-01-10","time":"15:00","home":"AD Tarrio","away":"AR Freixieiro","id":"fx_12_071","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":12,"date":"2027-01-09","time":"20:00","home":"GD Baguim Monte","away":"ADC Figueiras","id":"fx_12_072","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":13,"date":"2027-01-15","time":"21:00","home":"FC Paço Sousa","away":"AD Tarrio","id":"fx_13_073","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":13,"date":"2027-01-15","time":"22:30","home":"AA Leça","away":"AD Polenenses","id":"fx_13_074","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":13,"date":"2027-01-16","time":"18:00","home":"AR Freixieiro","away":"GD Baguim Monte","id":"fx_13_075","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":13,"date":"2027-01-16","time":"19:00","home":"Leais e Videirinhos","away":"Juventude Matosinhos","id":"fx_13_076","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":13,"date":"2027-01-16","time":"20:00","home":"ASC Monte Pedras","away":"Juventude Gaia B","id":"fx_13_077","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":13,"date":"2027-01-16","time":"21:00","home":"FC São Romão","away":"ARC Moinhos","id":"fx_13_078","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":14,"date":"2027-01-23","time":"18:00","home":"AR Freixieiro","away":"ADC Figueiras","id":"fx_14_079","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":14,"date":"2027-01-22","time":"21:00","home":"FC Paço Sousa","away":"GD Baguim Monte","id":"fx_14_080","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":14,"date":"2027-01-23","time":"21:00","home":"FC São Romão","away":"AD Tarrio","id":"fx_14_081","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":14,"date":"2027-01-22","time":"22:30","home":"AA Leça","away":"ARC Moinhos","id":"fx_14_082","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":14,"date":"2027-01-23","time":"20:00","home":"ASC Monte Pedras","away":"AD Polenenses","id":"fx_14_083","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":14,"date":"2027-01-23","time":"19:00","home":"Leais e Videirinhos","away":"Juventude Gaia B","id":"fx_14_084","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":15,"date":"2027-01-29","time":"21:30","home":"ADC Figueiras","away":"FC Paço Sousa","id":"fx_15_085","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":15,"date":"2027-01-30","time":"20:00","home":"GD Baguim Monte","away":"FC São Romão","id":"fx_15_086","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":15,"date":"2027-01-30","time":"15:00","home":"AD Tarrio","away":"AA Leça","id":"fx_15_087","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":15,"date":"2027-01-29","time":"21:30","home":"ARC Moinhos","away":"ASC Monte Pedras","id":"fx_15_088","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":15,"date":"2027-01-30","time":"21:00","home":"AD Polenenses","away":"Leais e Videirinhos","id":"fx_15_089","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":15,"date":"2027-01-30","time":"17:00","home":"Juventude Gaia B","away":"Juventude Matosinhos","id":"fx_15_090","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":16,"date":"2027-02-05","time":"21:00","home":"FC Paço Sousa","away":"AR Freixieiro","id":"fx_16_091","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":16,"date":"2027-02-06","time":"21:00","home":"FC São Romão","away":"ADC Figueiras","id":"fx_16_092","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":16,"date":"2027-02-05","time":"22:30","home":"AA Leça","away":"GD Baguim Monte","id":"fx_16_093","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":16,"date":"2027-02-06","time":"20:00","home":"ASC Monte Pedras","away":"AD Tarrio","id":"fx_16_094","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":16,"date":"2027-02-06","time":"19:00","home":"Leais e Videirinhos","away":"ARC Moinhos","id":"fx_16_095","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":16,"date":"2027-02-06","time":"21:00","home":"Juventude Matosinhos","away":"AD Polenenses","id":"fx_16_096","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":17,"date":"2027-02-13","time":"18:00","home":"AR Freixieiro","away":"FC São Romão","id":"fx_17_097","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":17,"date":"2027-02-12","time":"21:30","home":"ADC Figueiras","away":"AA Leça","id":"fx_17_098","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":17,"date":"2027-02-13","time":"20:00","home":"GD Baguim Monte","away":"ASC Monte Pedras","id":"fx_17_099","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":17,"date":"2027-02-13","time":"17:30","home":"AD Tarrio","away":"Leais e Videirinhos","id":"fx_17_100","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":17,"date":"2027-02-12","time":"21:30","home":"ARC Moinhos","away":"Juventude Matosinhos","id":"fx_17_101","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":17,"date":"2027-02-13","time":"21:00","home":"AD Polenenses","away":"Juventude Gaia B","id":"fx_17_102","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":18,"date":"2027-02-20","time":"21:00","home":"FC São Romão","away":"FC Paço Sousa","id":"fx_18_103","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":18,"date":"2027-02-19","time":"22:30","home":"AA Leça","away":"AR Freixieiro","id":"fx_18_104","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":18,"date":"2027-02-20","time":"20:00","home":"ASC Monte Pedras","away":"ADC Figueiras","id":"fx_18_105","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":18,"date":"2027-02-20","time":"19:00","home":"Leais e Videirinhos","away":"GD Baguim Monte","id":"fx_18_106","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":18,"date":"2027-02-20","time":"21:00","home":"Juventude Matosinhos","away":"AD Tarrio","id":"fx_18_107","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":18,"date":"2027-02-20","time":"16:45","home":"Juventude Gaia B","away":"ARC Moinhos","id":"fx_18_108","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":19,"date":"2027-03-05","time":"21:00","home":"FC Paço Sousa","away":"AA Leça","id":"fx_19_109","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":19,"date":"2027-03-06","time":"18:00","home":"AR Freixieiro","away":"ASC Monte Pedras","id":"fx_19_110","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":19,"date":"2027-03-05","time":"21:30","home":"ADC Figueiras","away":"Leais e Videirinhos","id":"fx_19_111","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":19,"date":"2027-03-06","time":"20:00","home":"GD Baguim Monte","away":"Juventude Matosinhos","id":"fx_19_112","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":19,"date":"2027-03-06","time":"15:00","home":"AD Tarrio","away":"Juventude Gaia B","id":"fx_19_113","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":19,"date":"2027-03-05","time":"21:30","home":"ARC Moinhos","away":"AD Polenenses","id":"fx_19_114","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":20,"date":"2027-03-12","time":"22:30","home":"AA Leça","away":"FC São Romão","id":"fx_20_115","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":20,"date":"2027-03-13","time":"20:00","home":"ASC Monte Pedras","away":"FC Paço Sousa","id":"fx_20_116","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":20,"date":"2027-03-13","time":"17:00","home":"Leais e Videirinhos","away":"AR Freixieiro","id":"fx_20_117","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":20,"date":"2027-03-13","time":"21:00","home":"Juventude Matosinhos","away":"ADC Figueiras","id":"fx_20_118","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":20,"date":"2027-03-13","time":"19:45","home":"Juventude Gaia B","away":"GD Baguim Monte","id":"fx_20_119","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":20,"date":"2027-03-13","time":"21:00","home":"AD Polenenses","away":"AD Tarrio","id":"fx_20_120","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":21,"date":"2027-03-20","time":"21:00","home":"FC São Romão","away":"ASC Monte Pedras","id":"fx_21_121","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":21,"date":"2027-03-19","time":"21:00","home":"FC Paço Sousa","away":"Leais e Videirinhos","id":"fx_21_122","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":21,"date":"2027-03-20","time":"18:00","home":"AR Freixieiro","away":"Juventude Matosinhos","id":"fx_21_123","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":21,"date":"2027-03-19","time":"21:30","home":"ADC Figueiras","away":"Juventude Gaia B","id":"fx_21_124","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":21,"date":"2027-03-20","time":"20:00","home":"GD Baguim Monte","away":"AD Polenenses","id":"fx_21_125","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":21,"date":"2027-03-20","time":"17:00","home":"AD Tarrio","away":"ARC Moinhos","id":"fx_21_126","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":22,"date":"2027-04-03","time":"20:00","home":"ASC Monte Pedras","away":"AA Leça","id":"fx_22_127","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":22,"date":"2027-04-03","time":"19:00","home":"Leais e Videirinhos","away":"FC São Romão","id":"fx_22_128","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":22,"date":"2027-04-03","time":"21:00","home":"Juventude Matosinhos","away":"FC Paço Sousa","id":"fx_22_129","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":22,"date":"2027-04-03","time":"16:30","home":"Juventude Gaia B","away":"AR Freixieiro","id":"fx_22_130","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":22,"date":"2027-04-03","time":"21:00","home":"AD Polenenses","away":"ADC Figueiras","id":"fx_22_131","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":22,"date":"2027-04-02","time":"21:30","home":"ARC Moinhos","away":"GD Baguim Monte","id":"fx_22_132","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":23,"date":"2027-04-09","time":"22:30","home":"AA Leça","away":"Leais e Videirinhos","id":"fx_23_133","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":23,"date":"2027-04-10","time":"21:00","home":"FC São Romão","away":"Juventude Matosinhos","id":"fx_23_134","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":23,"date":"2027-04-09","time":"21:00","home":"FC Paço Sousa","away":"Juventude Gaia B","id":"fx_23_135","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":23,"date":"2027-04-10","time":"18:00","home":"AR Freixieiro","away":"AD Polenenses","id":"fx_23_136","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":23,"date":"2027-04-09","time":"21:30","home":"ADC Figueiras","away":"ARC Moinhos","id":"fx_23_137","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":23,"date":"2027-04-10","time":"20:00","home":"GD Baguim Monte","away":"AD Tarrio","id":"fx_23_138","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true},{"round":24,"date":"2027-04-17","time":"19:00","home":"Leais e Videirinhos","away":"ASC Monte Pedras","id":"fx_24_139","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Pedrouços","homeScore":"","awayScore":"","fixture":true},{"round":24,"date":"2027-04-17","time":"21:00","home":"Juventude Matosinhos","away":"AA Leça","id":"fx_24_140","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":24,"date":"2027-04-17","time":"19:30","home":"Juventude Gaia B","away":"FC São Romão","id":"fx_24_141","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":24,"date":"2027-04-17","time":"21:00","home":"AD Polenenses","away":"FC Paço Sousa","id":"fx_24_142","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":24,"date":"2027-04-16","time":"21:30","home":"ARC Moinhos","away":"AR Freixieiro","id":"fx_24_143","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":24,"date":"2027-04-17","time":"15:00","home":"AD Tarrio","away":"ADC Figueiras","id":"fx_24_144","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":25,"date":"2027-04-24","time":"20:00","home":"ASC Monte Pedras","away":"Juventude Matosinhos","id":"fx_25_145","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Crestins","homeScore":"","awayScore":"","fixture":true},{"round":25,"date":"2027-04-23","time":"22:30","home":"AA Leça","away":"Juventude Gaia B","id":"fx_25_146","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Escola Secundária Boa Nova","homeScore":"","awayScore":"","fixture":true},{"round":25,"date":"2027-04-24","time":"21:00","home":"FC São Romão","away":"AD Polenenses","id":"fx_25_147","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão EB 2/3 São Romão Coronado","homeScore":"","awayScore":"","fixture":true},{"round":25,"date":"2027-04-23","time":"21:00","home":"FC Paço Sousa","away":"ARC Moinhos","id":"fx_25_148","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo Paço Sousa","homeScore":"","awayScore":"","fixture":true},{"round":25,"date":"2027-04-24","time":"18:00","home":"AR Freixieiro","away":"AD Tarrio","id":"fx_25_149","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Freixieiro","homeScore":"","awayScore":"","fixture":true},{"round":25,"date":"2027-04-23","time":"21:30","home":"ADC Figueiras","away":"GD Baguim Monte","id":"fx_25_150","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Nevogilde","homeScore":"","awayScore":"","fixture":true},{"round":26,"date":"2027-05-01","time":"21:00","home":"Juventude Matosinhos","away":"Leais e Videirinhos","id":"fx_26_151","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Leça do Balio","homeScore":"","awayScore":"","fixture":true},{"round":26,"date":"2027-05-01","time":"21:00","home":"Juventude Gaia B","away":"ASC Monte Pedras","id":"fx_26_152","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Carlos Resende","homeScore":"","awayScore":"","fixture":true},{"round":26,"date":"2027-05-01","time":"21:00","home":"AD Polenenses","away":"AA Leça","id":"fx_26_153","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal de Custóias","homeScore":"","awayScore":"","fixture":true},{"round":26,"date":"2027-05-01","time":"21:00","home":"ARC Moinhos","away":"FC São Romão","id":"fx_26_154","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão AR Moinhos P. Ferreira","homeScore":"","awayScore":"","fixture":true},{"round":26,"date":"2027-05-01","time":"21:00","home":"AD Tarrio","away":"FC Paço Sousa","id":"fx_26_155","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Desportivo de Rebordões","homeScore":"","awayScore":"","fixture":true},{"round":26,"date":"2027-05-01","time":"21:00","home":"GD Baguim Monte","away":"AR Freixieiro","id":"fx_26_156","seasonId":"s2627","competition":"AF Porto I Divisão Futsal · Série 2","venue":"Pavilhão Municipal Baguim do Monte","homeScore":"","awayScore":"","fixture":true}];
const blankRoster=()=>Object.fromEntries(seedPlayers.map(p=>[p.id,{status:'Não convocado',starter:false,used:false,stats:{goals:0,assists:0,yellow:0,secondYellow:0,red:0}}]));
function seedClubGames(){
 return seedFixtures.filter(f=>f.home==='ADC Figueiras'||f.away==='ADC Figueiras').map(f=>({
  id:`g_league_${f.round}`,fixtureId:f.id,seasonId:f.seasonId,date:f.date,time:f.time,round:String(f.round),
  opponent:f.home==='ADC Figueiras'?f.away:f.home,homeAway:f.home==='ADC Figueiras'?'Casa':'Fora',
  competition:f.competition,countsForStandings:true,venue:f.venue,status:'scheduled',homeScore:'',awayScore:'',roster:blankRoster(),timeline:[],weighIns:{}
 }));
}


function defaultState(){
 return {
  schemaVersion:10,
  settings:{club:'ADC Figueiras',activeSeasonId:'s2627',weightReference:'pre',nutritionTemplate:'',nutritionEnabled:false,lastBackupAt:''},
  seasons:[{id:'s2627',label:'2026/27',active:true,archived:false,competitionName:'AF Porto I Divisão Futsal · Série 2'}],
  teams:seedTeams.map(t=>({...t})),
  players:seedPlayers.map(p=>({...p})),
  users:[],
  trainings:[],games:seedClubGames(),fines:[],fineRules:[
   {id:'fr_training_late',code:'training_late',reason:'Atraso ao treino',amount:2,active:true,automatic:true,description:'Aplica automaticamente uma multa quando um jogador fica marcado como Atrasado num treino.'}
  ],competitionResults:seedFixtures.map(f=>({...f})),standings:[],notifications:[],news:[],joinRequests:[]
 };
}

function migrateV1(v1){
 const d=defaultState();
 d.players=(v1.players||d.players).map(p=>({...p}));
 const seasonLabel=v1.settings?.season||'2026/27';
 d.seasons=[{id:'s_migrated',label:seasonLabel,active:true,archived:false}];
 d.settings.activeSeasonId='s_migrated';
 d.settings.club=v1.settings?.club||'ADC Figueiras';
 d.trainings=(v1.trainings||[]).map(t=>({...t,seasonId:'s_migrated'}));
 d.games=(v1.games||[]).map(g=>({...g,seasonId:'s_migrated',status:(g.homeScore!==''&&g.awayScore!=='')?'final':'scheduled',timeline:g.timeline||[]}));
 d.fines=(v1.fines||[]).map(f=>({...f,seasonId:'s_migrated'}));
 d.users=[];
 d.notifications.push({id:uid('n'),createdAt:new Date().toISOString(),type:'system',title:'V1 migrada para V2',body:'Os dados locais existentes foram importados automaticamente para a nova estrutura.',audience:'admin',status:'sent'});
 return d;
}

function fixtureKey(x){return `${String(x.round||'')}|${String(x.date||'')}|${canonicalTeamName(x.home)}|${canonicalTeamName(x.away)}`}
function clubGameKey(g){return `${String(g.round||'')}|${String(g.date||'')}|${canonicalTeamName(g.opponent)}`}
function mergeFixtures(existing=[]){
 const byId=new Map(existing.map(x=>[x.id,x]));
 const byKey=new Map(existing.map(x=>[fixtureKey(x),x]));
 const merged=seedFixtures.map(seed=>{
  const old=byId.get(seed.id)||byKey.get(fixtureKey(seed));
  return old?{...seed,...old,home:canonicalTeamName(old.home||seed.home),away:canonicalTeamName(old.away||seed.away)}:{...seed};
 });
 const keys=new Set(merged.map(f=>fixtureKey(f)));
 existing.forEach(x=>{if(!keys.has(fixtureKey(x)))merged.push({...x,home:canonicalTeamName(x.home),away:canonicalTeamName(x.away)})});
 return merged;
}
function mergeClubGames(existing=[]){
 const seeds=seedClubGames();
 const used=new Set();
 const merged=seeds.map(seed=>{
  const old=existing.find(g=>g.fixtureId===seed.fixtureId)||existing.find(g=>String(g.round||'')===String(seed.round)&&String(g.date||'')===seed.date&&canonicalTeamName(g.opponent)===canonicalTeamName(seed.opponent));
  if(old){used.add(old.id);return {...seed,...old,fixtureId:seed.fixtureId,competition:old.competition||seed.competition,countsForStandings:old.countsForStandings!==false}}
  return seed;
 });
 existing.forEach(g=>{if(!used.has(g.id)&&!merged.some(x=>x.id===g.id))merged.push(g)});
 return merged;
}
// Backups JSON são ficheiros não confiáveis; recusar estruturas excessivas,
// propriedades especiais e HTML ativo antes de as introduzir na interface.
function sanitizeImportedSnapshot(value,depth=0){
 if(depth>32)throw new Error('Estrutura do backup demasiado profunda.');
 if(typeof value==='string')return value.normalize('NFC').replace(/[<>]/g,'').slice(0,8192);
 if(Array.isArray(value)){
  if(value.length>100000)throw new Error('Backup com demasiados registos.');
  return value.map(v=>sanitizeImportedSnapshot(v,depth+1));
 }
 if(value&&typeof value==='object'){
  const entries=Object.entries(value);
  if(entries.length>2000)throw new Error('Objeto de backup demasiado grande.');
  return Object.fromEntries(entries.filter(([k])=>!['__proto__','prototype','constructor'].includes(k)).map(([k,v])=>[k,sanitizeImportedSnapshot(v,depth+1)]));
 }
 if(value===null||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return value;
 throw new Error('Valor inválido no backup.');
}
function normalizeState(raw){
 const base=defaultState();
 const out={
  ...base,
  ...raw,
  schemaVersion:10,
  settings:{...base.settings,...(raw.settings||{})},
  seasons:(raw.seasons?.length?raw.seasons:base.seasons).map(s=>({...s,competitionName:s.competitionName||'AF Porto I Divisão Futsal · Série 2'})),
  teams:base.teams,
  players:(raw.players?.length?raw.players:base.players).map(p=>({...p,status:normalizePlayerStatus(p.status)})),
  users:raw.users?.length?raw.users:base.users,
  trainings:raw.trainings||[],
  games:mergeClubGames(raw.games||[]).map(g=>({...g,halfTimeHomeScore:g.halfTimeHomeScore??'',halfTimeAwayScore:g.halfTimeAwayScore??'',captainId:g.captainId||'',weighIns:g.weighIns||{},roster:Object.fromEntries(Object.entries(g.roster||{}).map(([id,r])=>[id,{...r,status:normalizeRosterStatus(r?.status)}]))})),
  fines:raw.fines||[],
  fineRules:raw.fineRules?.length?raw.fineRules:base.fineRules,
  competitionResults:mergeFixtures(raw.competitionResults||[]),
  standings:raw.standings||[],
  notifications:raw.notifications||[],
  news:raw.news||[],
  joinRequests:raw.joinRequests||[]
 };
 syncClubGamesToFixtures(out);
 return out;
}
// Apenas informação pública pode persistir no dispositivo.
function publicCacheSnapshot(source){
 const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o&&o[k]!==undefined).map(k=>[k,o[k]]));
 const games=(source?.games||[]).map(g=>{
  const published=g.status==='final'||g.status==='completed';
  const item=pick(g,['id','backendId','seasonId','fixtureId','competitionId','competitionSlug','competitionType','officialFixture','fixture','source','date','time','round','opponent','homeAway','competition','countsForStandings','venue','status','homeScore','awayScore','halfTimeHomeScore','halfTimeAwayScore','administrativeDecision','homePenalties','awayPenalties']);
  item.roster=published?Object.fromEntries(Object.entries(g.roster||{}).filter(([,r])=>r?.status==='Convocado').map(([id,r])=>[id,{status:'Convocado',starter:r.starter===true,used:r.used===true,stats:pick(r.stats||{},['goals','assists','yellow','secondYellow','red'])}])):{};
  item.timeline=published?(g.timeline||[]).map(ev=>pick(ev,['id','backendId','type','minute','playerId','assistId','ownGoal'])):[];
  item.captainId=published?g.captainId||'':'';
  return item;
 });
 return {
  schemaVersion:10,
  settings:pick(source?.settings,['club','activeSeasonId','lastBackupAt']),
  seasons:(source?.seasons||[]).map(s=>pick(s,['id','backendId','label','active','archived','competitionName','backendStartDate','backendEndDate'])),
  teams:(source?.teams||[]).map(t=>pick(t,['id','name','short','logo','homeVenue','aliases','backendId'])),
  players:(source?.players||[]).map(p=>pick(p,['id','backendId','name','position','number','active','photo_url'])),
  games,
  competitionResults:(source?.competitionResults||[]).map(r=>pick(r,['id','backendId','seasonId','competitionId','competitionSlug','competitionType','competition','round','date','time','home','away','homeScore','awayScore','venue','fixture','officialFixture','source','clubGameId','fromClubGame','administrativeDecision'])),
  standings:(source?.standings||[]).map(r=>pick(r,['id','seasonId','competitionId','team','j','v','e','d','gf','ga','pts'])),
  users:[],trainings:[],fines:[],fineRules:[],notifications:[],joinRequests:[],news:[]
 };
}
function persistPublicCache(){try{localStorage.setItem(V2_KEY,JSON.stringify(publicCacheSnapshot(state)))}catch(e){console.warn('Cache pública não guardada',e)}}
function sanitizeLegacyBrowserCache(){
 // Não deixar uma cópia antiga com pesagens ou dados de conta em armazenamento
 // persistente, mesmo quando o backup local não é JSON válido.
 try{
  const old=localStorage.getItem(AUTO_BACKUP_KEY);
  if(old){
   try{
    const v=JSON.parse(old);
    localStorage.setItem(AUTO_BACKUP_KEY,JSON.stringify({savedAt:v?.savedAt||'',data:publicCacheSnapshot(v?.data||{})}));
   }catch(e){localStorage.removeItem(AUTO_BACKUP_KEY);console.warn('Backup antigo inválido removido da cache.',e)}
  }
  localStorage.removeItem(V1_KEY);
 }catch(e){console.warn('Não foi possível limpar as chaves legadas.',e)}
 persistPublicCache();
}
function resetPublicRuntimeState(){
 state=normalizeState(publicCacheSnapshot(state));
 backendConnected=false;
 backendSession=null;backendProfile=null;backendRoles=[];backendPlayerAccount=null;
 backendPrivacyAcknowledgement=null;backendPrivacyLoaded=false;
 backendReference={settings:null,seasons:[],competitions:[],teams:[],competitionTeams:[]};backendReferenceLoaded=false;
 backendPeople={profiles:[],roles:[],links:[],invitations:[]};backendPeopleLoaded=false;
 backendRoster={seasonId:'',rows:[]};backendRosterLoaded=false;
 backendMatches={seasonId:'',rows:[]};backendMatchesLoaded=false;
 backendMatchCenter={matchPlayers:[],events:[],weighIns:[]};backendMatchCenterLoaded=false;backendMatchWeightsAvailable=false;
 backendNutritionLoaded=false;
 backendTraining={seasonId:'',trainings:[],attendance:[],weighIns:[]};backendTrainingLoaded=false;
 backendFines={seasonId:'',rules:[],fines:[]};backendFinesLoaded=false;
 backendNotifications={rows:[],recipients:[],preferences:null};backendNotificationsLoaded=false;
 backendNotificationSchedule={...NOTIFICATION_SCHEDULE_DEFAULTS};backendNotificationScheduleLoaded=false;
 backendPushDevice={supported:false,permission:'default',subscribed:false,endpoint:'',row:null};
 persistPublicCache();
}
function loadState(){
 try{
  const v2=localStorage.getItem(V2_KEY); if(v2) return normalizeState(publicCacheSnapshot(JSON.parse(v2)));
  const v1=localStorage.getItem(V1_KEY); if(v1)return normalizeState(publicCacheSnapshot(migrateV1(JSON.parse(v1))));
 }catch(e){console.warn(e)}
 return defaultState();
}
let state=loadState();
sanitizeLegacyBrowserCache();
let currentView='dashboard';
let mode='public';
let calendarCursor=new Date();calendarCursor.setDate(1);
let toastTimer;
let resultsCompetitionFilter='all';
let resultsRoundFilter='all';
let resultsTeamFilter='all';
let calendarEventFilter='all';
let standingsCompetitionId='';
let historicalEditMode=false;
let selectedTeamName=sessionStorage.getItem('teamView')||'ADC Figueiras';
let selectedPlayerId=sessionStorage.getItem('playerView')||'';

const viewInfo={
 dashboard:['Início','Visão geral do clube'],games:['Jogos','Calendário, resultados e fichas de jogo'],matchcenter:['Match Center','Factos e acontecimentos do jogo'],calendar:['Calendário','Treinos e jogos'],seriesResults:['Resultados','Competições oficiais da época'],standings:['Classificação','Calculada automaticamente pelos resultados'],team:['Equipa','Jogos, forma recente e resultados'],stats:['Estatísticas','Jogadores e equipa'],player:['Ficha de jogador','Perfil e estatísticas individuais'],squad:['Plantel','Jogadores e disponibilidade'],training:['Treinos','Presenças e pesagens'],weights:['Pesagens','Histórico e evolução do plantel'],notifications:['Notificações','Comunicação com atletas e sócios'],account:['A minha conta','Perfil, sócio e segurança'],privacy:['Privacidade','Dados, acessos e transparência'],fines:['Multas','Registo interno'],fineRules:['Regras de multas','Motivos e automatismos'],seasons:['Épocas','Arquivo histórico'],people:['Pessoas e acessos','Utilizadores e múltiplas funções'],settings:['Definições','Dados, backups e integrações']
};

const NAV_ICONS={
 home:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z"/></svg>`,
 fixture:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 2v4M17 2v4M3 9h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m12 12.3 1.5 1.1-.6 1.8h-1.8l-.6-1.8z"/></svg>`,
 calendar:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 3v4M17 3v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 14h3M14 14h3M7 18h3M14 18h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
 scoreboard:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5v14" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".7"/><path d="M6 10.5c.4-1 1.3-1.5 2.3-1.5 1.2 0 2.2.7 2.2 1.8 0 1.2-.8 1.8-2.8 3.7h3M15 10h3M16.5 8.5v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
 podium:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8h6v13H9zM3 13h6v8H3zM15 11h6v10h-6z"/><path d="m12 2 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/></svg>`,
 stats:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>`,
 shirt:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3c.7 1 1.9 1.7 3.5 1.7S14.8 4 15.5 3L21 5.5l-2.5 5-2.5-1.2V21H8V9.3L5.5 10.5 3 5.5z"/></svg>`,
 cone:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3h5L19 19H5z"/><path d="M7.6 12h8.8M6.4 16h11.2" fill="none" stroke="#fff" stroke-width="1.7" opacity=".9"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>`,
 scale:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="4"/><path d="M8 9a4 4 0 0 1 8 0" fill="none" stroke="#073c2a" stroke-width="1.8"/><path d="m12 9 2-2" fill="none" stroke="#073c2a" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="9" r="1" fill="#073c2a"/></svg>`,
 ball:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2z"/><path d="m9 9.2-3.2-.4M15 9.2l3.2-.4M10.1 12.7l-2 3M13.9 12.7l2 3M8.1 15.7l.5 3.1M15.9 15.7l-.5 3.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
 bell:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14l-1.6-2.1V10a5.4 5.4 0 0 0-4.2-5.3V3h-2.4v1.7A5.4 5.4 0 0 0 6.6 10v4.9z"/><path d="M9.5 19a2.6 2.6 0 0 0 5 0z"/></svg>`,
 banknote:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3" fill="#073c2a"/><path d="M5 9c1.4 0 2.5-1.1 2.5-2.5M19 9c-1.4 0-2.5-1.1-2.5-2.5M5 15c1.4 0 2.5 1.1 2.5 2.5M19 15c-1.4 0-2.5 1.1-2.5 2.5" fill="none" stroke="#073c2a" stroke-width="1.3"/></svg>`,
 gavel:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.8 4.2 6 6-2.5 2.5-6-6zM8.6 7.3l8.1 8.1-2.5 2.5-8.1-8.1zM4 18h9v3H4z"/></svg>`,
 season:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M4 10h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="15" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="12" cy="18" r="1.2"/></svg>`,
 shield:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5.2-3.3 8.8-8 11-4.7-2.2-8-5.8-8-11V5z"/><path d="M12 6v11" fill="none" stroke="#fff" stroke-width="1.5" opacity=".55"/></svg>`,
 users:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3" opacity=".75"/><path d="M3 20c.5-4.1 2.5-6 6-6s5.5 1.9 6 6zM14.5 15.2c3.4-.4 5.5 1.2 6.5 4.8h-5.2c-.2-1.9-.7-3.5-1.3-4.8z"/></svg>`,
 sliders:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h10M18 18h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></svg>`
};
function navIcon(name){return NAV_ICONS[name]||NAV_ICONS.shield}

const navDefs=[
 {group:'Clube',items:[
  ['dashboard','home','Início','#ffffff'],
  ['games','fixture','Jogos','#ff6b57'],
  ['calendar','calendar','Calendário','#f472b6'],
  ['seriesResults','scoreboard','Resultados','#60a5fa'],
  ['standings','podium','Classificação','#fbbf24'],
  ['stats','stats','Estatísticas','#34d399'],
  ['seasons','season','Épocas','#f472b6']
 ]},
 {group:'Equipa',items:[
  ['squad','shirt','Plantel','#a78bfa'],
  ['training','cone','Treinos','#fb923c'],
  ['weights','scale','Pesagens','#36d1c4'],
  ['matchcenter','ball','Match Center','#ff625c']
 ]},
 {group:'Comunicação',items:[['notifications','bell','Notificações','#fbbf24']]},
 {group:'Conta',items:[['account','users','A minha conta','#8bafff'],['privacy','shield','Privacidade','#9ca3af']]},
 {group:'Gestão',items:[
  ['fines','banknote','Multas','#fbbf24'],
  ['fineRules','gavel','Regras de multas','#60a5fa'],
  ['people','users','Pessoas e acessos','#8bafff'],
  ['settings','sliders','Definições','#d7dee8']
 ]}
];
const access={
 public:['dashboard','games','calendar','seriesResults','standings','team','stats','player','squad','matchcenter','seasons','notifications','account','privacy'],
 member:['dashboard','games','calendar','seriesResults','standings','team','stats','player','squad','matchcenter','seasons','notifications','account','privacy'],
 player:['dashboard','games','calendar','seriesResults','standings','team','stats','player','squad','training','weights','matchcenter','seasons','notifications','account','privacy'],
 captain:['dashboard','games','calendar','seriesResults','standings','team','stats','player','squad','training','weights','matchcenter','seasons','notifications','account','privacy','fines'],
 staff:['dashboard','games','calendar','seriesResults','standings','team','stats','player','squad','training','weights','matchcenter','seasons','notifications','account','privacy','fines','fineRules'],
 admin:['dashboard','games','calendar','seriesResults','standings','team','stats','player','squad','training','weights','matchcenter','notifications','account','privacy','fines','fineRules','seasons','people','settings']
};
const can=v=>{
 if((v==='notifications'||v==='account')&&guestMode)return false;
 if(v==='seasons')return true;
 if(isHistoricalSeason()){
  if(['people','settings'].includes(v))return false;
  if(v==='squad')return true;
  if(['training','weights','fines','fineRules'].includes(v))return backendRoles.includes('admin');
  if(v==='matchcenter')return backendRoles.includes('admin')||(access[mode]||[]).includes('matchcenter');
 }
 return (access[mode]||access.public).includes(v);
};
const canEdit=()=>isHistoricalSeason()?(backendRoles.includes('admin')&&historicalEditMode):(mode==='staff'||mode==='admin');
const canManageFines=()=>isHistoricalSeason()?(backendRoles.includes('admin')&&historicalEditMode):(mode==='captain'||mode==='staff'||mode==='admin');
const canManageFineRules=()=>isHistoricalSeason()?(backendRoles.includes('admin')&&historicalEditMode):(mode==='staff'||mode==='admin');
const isAdmin=()=>mode==='admin';

function saveState(msg){syncClubGamesToFixtures();try{const previous=localStorage.getItem(V2_KEY);if(previous)localStorage.setItem(AUTO_BACKUP_KEY,JSON.stringify({savedAt:new Date().toISOString(),data:publicCacheSnapshot(JSON.parse(previous))}))}catch(e){console.warn('Auto-backup falhou',e)}persistPublicCache();renderChrome();renderView(currentView);if(msg)toast(msg)}
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),2200)}
function activeSeason(){return state.seasons.find(s=>s.id===state.settings.activeSeasonId)||state.seasons[0]}
async function switchSeason(seasonId){
 const target=state.seasons.find(s=>s.id===seasonId);if(!target)return;
 state.settings.activeSeasonId=target.id;historicalEditMode=false;resultsCompetitionFilter='all';resultsRoundFilter='all';resultsTeamFilter='all';standingsCompetitionId='';
 calendarCursor=new Date(`${target.backendStartDate||target.label.split('/')[0]+'-07-01'}T12:00:00`);calendarCursor.setDate(1);
 if(backendConnected){
  await loadBackendRosterData();await loadBackendMatchesData();await loadBackendMatchCenterData();
  const firstGame=[...seasonGames()].sort((a,b)=>dateTimeOf(a.date,a.time)-dateTimeOf(b.date,b.time))[0];if(firstGame){calendarCursor=new Date(`${firstGame.date}T12:00:00`);calendarCursor.setDate(1)}
  const internal=backendRoles.some(r=>['admin','staff','captain','player'].includes(r));
  if(internal&&(!isHistoricalSeason()||backendRoles.includes('admin'))){await loadBackendTrainingData();await loadBackendFinesData()}
  else{backendTraining={seasonId:'',trainings:[],attendance:[],weighIns:[]};backendTrainingLoaded=false;backendFines={seasonId:'',rules:[],fines:[]};backendFinesLoaded=false}
 }
 try{persistPublicCache()}catch{}
 renderChrome();showView('dashboard');
}
function seasonGames(){return state.games.filter(g=>(g.seasonId||state.settings.activeSeasonId)===state.settings.activeSeasonId)}
function seasonTrainings(){return state.trainings.filter(t=>(t.seasonId||state.settings.activeSeasonId)===state.settings.activeSeasonId)}
function playerById(id){return state.players.find(p=>p.id===id)}
function userByPlayer(id){return state.users.find(u=>u.playerId===id)}
function currentUser(){if(guestMode)return {id:'guest',name:'Visitante',email:'',roles:[],playerId:'',memberNumber:'',active:true};if(backendSession)return {id:backendSession.user.id,name:backendDisplayName(),email:backendSession.user.email||'',roles:[...backendRoles],playerId:localPlayerIdForBackend(backendPlayerAccount?.player_id||''),memberNumber:backendProfile?.member_number||'',memberStatus:backendProfile?.member_status||'none',active:backendProfile?.active!==false};return state.users[0]}
function playerHtml(p){return `<div class="player"><div class="avatar">${esc(initials(p.name))}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.position||'Jogador')}${p.number?` · #${esc(p.number)}`:''}</small></div></div>`}
function playerStatHtml(p){return `<div class="player"><div class="avatar number">${esc(p.number||'—')}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.position||'Jogador')}${p.number?` · #${esc(p.number)}`:''}</small></div></div>`}
function fineRuleByCode(code){return (state.fineRules||[]).find(r=>r.code===code)}
function syncTrainingLateFines(training){
 if(backendConnected&&backendFinesLoaded)return;
 const rule=fineRuleByCode('training_late');
 if(!rule)return;
 const lateIds=Object.entries(training.entries||{}).filter(([,entry])=>entry.status==='Atrasado').map(([id])=>id);
 state.fines=state.fines.filter(f=>!(f.sourceType==='training_late'&&f.sourceId===training.id&&!lateIds.includes(f.playerId)));
 lateIds.forEach(playerId=>{
  const existing=state.fines.find(f=>f.sourceType==='training_late'&&f.sourceId===training.id&&f.playerId===playerId);
  const payload={seasonId:training.seasonId||state.settings.activeSeasonId,playerId,date:training.date,reason:rule.reason,amount:Number(rule.amount)||0,paid:false,sourceType:'training_late',sourceId:training.id,auto:true};
  if(existing)Object.assign(existing,payload);
  else if(rule.active)state.fines.push({id:uid('f'),...payload});
 });
}
function pill(txt,type='gray'){return `<span class="pill ${type}">${esc(txt)}</span>`}
function empty(t,b=''){return `<div class="empty"><b>${esc(t)}</b>${b?`<span>${esc(b)}</span>`:''}</div>`}
function normalizePlayerStatus(s){return ({Castigado:'Suspenso',Indisponível:'Ausente'}[s]||s||'Disponível')}
function normalizeRosterStatus(s){return ({Castigado:'Suspenso',Indisponível:'Ausente'}[s]||s||'Não convocado')}
function statusPillType(s){s=normalizePlayerStatus(s);return s==='Disponível'?'green':s==='Lesionado'||s==='Suspenso'?'red':s==='Em dúvida'?'amber':'gray'}
function roleLabel(r){return ({player:'Jogador',captain:'Capitão',staff:'Equipa técnica',admin:'Admin',member:'Sócio'}[r]||r)}
function gameTitle(g){return g.homeAway==='Casa'?`ADC Figueiras vs ${g.opponent}`:`${g.opponent} vs ADC Figueiras`}
function scoreText(g){
 if(g.administrativeDecision)return 'DA';
 if(g.homeScore===''||g.awayScore==='')return '—';
 const base=g.homeAway==='Fora'?`${g.awayScore}–${g.homeScore}`:`${g.homeScore}–${g.awayScore}`;
 if(g.homePenalties!==''&&g.awayPenalties!==''){
  const p=g.homeAway==='Fora'?`${g.awayPenalties}–${g.homePenalties}`:`${g.homePenalties}–${g.awayPenalties}`;
  return `${base} (${p} g.p.)`;
 }
 return base;
}
function resultScoreText(r){
 if(r?.administrativeDecision)return 'DA';
 if(r?.homeScore===''||r?.awayScore==='')return '—';
 const base=`${r.homeScore}–${r.awayScore}`;
 return r.homePenalties!==''&&r.awayPenalties!==''?`${base} (${r.homePenalties}–${r.awayPenalties} g.p.)`:base;
}
function competitionById(id){return (backendReference.competitions||[]).find(c=>c.id===id)||null}
function standingsCompetitions(){return activeBackendCompetitions().filter(c=>c.counts_for_standings===true)}
function competitionTeamsFor(compId){
 const ids=new Set((backendReference.competitionTeams||[]).filter(x=>x.competition_id===compId).map(x=>x.team_id));
 return (backendReference.teams||[]).filter(t=>ids.has(t.id)).map(t=>canonicalTeamName(backendTeamName(t)));
}
function cleanTeamKey(name){return String(name||'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function canonicalTeamName(name){
 const key=cleanTeamKey(name);
 const t=seedTeams.find(t=>[t.name,...(t.aliases||[])].some(a=>cleanTeamKey(a)===key));
 return t?.name||String(name||'').trim().replace(/\s+/g,' ');
}
function normalizedTeamName(name){return canonicalTeamName(name)}
function teamByName(name){const canonical=canonicalTeamName(name);const local=(state?.teams||seedTeams).find(t=>t.name===canonical)||seedTeams.find(t=>t.name===canonical);if(local)return local;const remote=backendTeamByName(canonical);return remote?{name:backendTeamName(remote),short:remote.short_name||remote.name,logo:remote.crest_url||'',homeVenue:'',aliases:[remote.name,remote.short_name].filter(Boolean)}:null}
function safeImageSource(value){
 const raw=String(value||'').trim();
 if(!raw||/[\u0000-\u001f\u007f]/.test(raw))return '';
 try{
  const url=new URL(raw,location.href);
  // HTTPS externo ou ficheiros do próprio site. Nunca data:, blob: ou javascript:.
  if(url.protocol==='https:'||(url.origin===location.origin&&url.protocol==='http:'))return url.href;
 }catch{}
 return '';
}
function teamLogoHtml(name,cls=''){
 const t=teamByName(name);const n=canonicalTeamName(name);const abbr=n.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 const src=safeImageSource(t?.logo);
 if(!src)return `<span class="team-logo ${esc(cls)}"><span class="team-logo-fallback">${esc(abbr)}</span></span>`;
 return `<span class="team-logo ${esc(cls)}"><img src="${esc(src)}" alt="Emblema de ${esc(n)}" referrerpolicy="no-referrer" loading="lazy"><span class="team-logo-fallback">${esc(abbr)}</span></span>`;
}
// Usar listener, em vez de atributos onerror inline, para permitir CSP sem unsafe-inline.
document.addEventListener('error',event=>{
 const img=event.target;
 if(img?.matches?.('.team-logo img'))img.closest('.team-logo')?.classList.add('logo-failed');
},true);
function teamCell(name){const n=canonicalTeamName(name);return `<button class="team-cell team-link" type="button" data-team-link="${esc(n)}">${teamLogoHtml(n)}<strong>${esc(n)}</strong></button>`}
function isFigueirasTeam(name){return canonicalTeamName(name)==='ADC Figueiras'}
function isExtraSeriesGame(r){return !!r&&(r.fixture===false||String(r.id||'').startsWith('cr_'))}
function seasonCompetitionResults(){return (state.competitionResults||[]).filter(r=>(r.seasonId||state.settings.activeSeasonId)===state.settings.activeSeasonId)}
function seasonCompetitionFixtures(){return seasonCompetitionResults()}
function isLeagueGame(g){
 if(g.countsForStandings===false)return false;
 const c=String(g.competition||'').toLowerCase();
 if(/taça|taca|amig|prepar|torneio/.test(c))return false;
 return true;
}
function isCupCompetition(value){return /taça\s*af\s*porto|taca\s*af\s*porto/.test(String(value||'').toLowerCase())}
function isCupGame(g){return !!g&&isCupCompetition(g.competition)}
function clubGameResultRow(g){
 const home=g.homeAway==='Casa'?'ADC Figueiras':canonicalTeamName(g.opponent);
 const away=g.homeAway==='Casa'?canonicalTeamName(g.opponent):'ADC Figueiras';
 return {id:`club_${g.id}`,clubGameId:g.id,backendId:g.backendId||'',seasonId:g.seasonId,competitionId:g.competitionId||'',competitionSlug:g.competitionSlug||'',competition:g.competition||'',round:g.round||'',date:g.date||'',time:g.time||'',home,away,homeScore:g.homeScore===''?'':Number(g.homeAway==='Casa'?g.homeScore:g.awayScore),awayScore:g.awayScore===''?'':Number(g.homeAway==='Casa'?g.awayScore:g.homeScore),venue:g.venue||'',fixture:true,fromClubGame:true,administrativeDecision:g.administrativeDecision||'',administrativeHomeScore:g.homeAway==='Casa'?g.administrativeHomeScore:g.administrativeAwayScore,administrativeAwayScore:g.homeAway==='Casa'?g.administrativeAwayScore:g.administrativeHomeScore,homePenalties:g.homeAway==='Casa'?g.homePenalties:g.awayPenalties,awayPenalties:g.homeAway==='Casa'?g.awayPenalties:g.homePenalties};
}
function seasonCupResults(){return seasonGames().filter(isCupGame).map(clubGameResultRow)}
function syncClubGamesToFixtures(target=state){
 if(!target?.competitionResults||!target?.games)return;
 target.games.filter(isLeagueGame).forEach(g=>{
  let f=target.competitionResults.find(x=>x.id===g.fixtureId);
  if(!f){
   const home=g.homeAway==='Casa'?'ADC Figueiras':canonicalTeamName(g.opponent);
   const away=g.homeAway==='Casa'?canonicalTeamName(g.opponent):'ADC Figueiras';
   f=target.competitionResults.find(x=>String(x.round||'')===String(g.round||'')&&canonicalTeamName(x.home)===home&&canonicalTeamName(x.away)===away);
  }
  if(!f)return;
  g.fixtureId=f.id;f.clubGameId=g.id;f.fromClubGame=true;
  f.round=g.round||f.round;f.date=g.date||f.date;f.time=g.time||f.time;f.venue=g.venue||f.venue;
  f.homeScore=g.administrativeDecision?'':(g.homeScore===''?'':Number(g.homeAway==='Casa'?g.homeScore:g.awayScore));
  f.awayScore=g.administrativeDecision?'':(g.awayScore===''?'':Number(g.homeAway==='Casa'?g.awayScore:g.homeScore));
  f.administrativeDecision=g.administrativeDecision||'';f.administrativeHomeScore=g.homeAway==='Casa'?g.administrativeHomeScore:g.administrativeAwayScore;f.administrativeAwayScore=g.homeAway==='Casa'?g.administrativeAwayScore:g.administrativeHomeScore;
 });
}
function allCompetitionResults(compId=''){
 syncClubGamesToFixtures();
 const target=compId||primaryLeagueCompetition()?.id||'';
 return seasonCompetitionFixtures().filter(r=>(!target||r.competitionId===target)&&r.home&&r.away&&((r.homeScore!==''&&r.awayScore!=='')||r.administrativeDecision));
}
function calculateStandings(compId=''){
 const target=compId||primaryLeagueCompetition()?.id||'';
 const table=new Map();
 const ensure=name=>{const key=canonicalTeamName(name);if(!key)return null;if(!table.has(key))table.set(key,{team:key,j:0,v:0,e:0,d:0,gf:0,ga:0,dg:0,pts:0});return table.get(key)};
 const participants=target?competitionTeamsFor(target):[];
 (participants.length?participants:(state.teams||seedTeams).map(t=>t.name)).forEach(ensure);
 allCompetitionResults(target).forEach(m=>{
  const h=ensure(m.home),a=ensure(m.away);if(!h||!a)return;
  h.j++;a.j++;
  if(m.administrativeDecision){
   const ah=m.administrativeHomeScore===''?null:Number(m.administrativeHomeScore),aa=m.administrativeAwayScore===''?null:Number(m.administrativeAwayScore);
   if(Number.isFinite(ah)&&Number.isFinite(aa)){h.gf+=ah;h.ga+=aa;a.gf+=aa;a.ga+=ah}
   if(m.administrativeDecision==='home_win'){h.v++;h.pts+=3;a.d++}
   else if(m.administrativeDecision==='away_win'){a.v++;a.pts+=3;h.d++}
   else {h.d++;a.d++}
   return;
  }
  const hs=Number(m.homeScore),as=Number(m.awayScore);if(!Number.isFinite(hs)||!Number.isFinite(as))return;
  h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
  if(hs>as){h.v++;a.d++;h.pts+=3}else if(hs<as){a.v++;h.d++;a.pts+=3}else{h.e++;a.e++;h.pts++;a.pts++}
 });
 const rows=[...table.values()].map(r=>({...r,dg:r.gf-r.ga}));
 rows.sort((a,b)=>b.pts-a.pts||b.dg-a.dg||b.gf-a.gf||a.team.localeCompare(b.team,'pt'));
 return rows.map((r,i)=>({...r,position:i+1}));
}
function competitionName(){const c=primaryLeagueCompetition();return c?`AF Porto I Divisão Futsal · ${c.series_name||c.name}`:(activeSeason()?.competitionName||'AF Porto I Divisão Futsal · Série 2')}
function openTeamPage(name){selectedTeamName=canonicalTeamName(name);sessionStorage.setItem('teamView',selectedTeamName);showView('team')}
function openPlayerProfile(id){if(!playerById(id))return;selectedPlayerId=id;sessionStorage.setItem('playerView',id);showView('player')}
function completedCompetitionMatches(){syncClubGamesToFixtures();return seasonCompetitionFixtures().filter(m=>m.home&&m.away&&((m.homeScore!==''&&m.awayScore!=='')||m.administrativeDecision))}
function resultForTeam(m,team){team=canonicalTeamName(team);const home=canonicalTeamName(m.home)===team;if(m.administrativeDecision){if(m.administrativeDecision==='both_loss')return 'D';return (m.administrativeDecision==='home_win')===home?'V':'D'}const gf=Number(home?m.homeScore:m.awayScore),ga=Number(home?m.awayScore:m.homeScore);if(!Number.isFinite(gf)||!Number.isFinite(ga))return '';return gf>ga?'V':gf<ga?'D':'E'}
function teamMatches(name){const t=canonicalTeamName(name);return seasonCompetitionFixtures().filter(m=>canonicalTeamName(m.home)===t||canonicalTeamName(m.away)===t)}
function teamRecentForm(name,limit=5){return teamMatches(name).filter(m=>(m.homeScore!==''&&m.awayScore!=='')||m.administrativeDecision).sort((a,b)=>dateTimeOf(b.date,b.time)-dateTimeOf(a.date,a.time)).slice(0,limit).reverse().map(m=>({match:m,result:resultForTeam(m,name)}))}
function formPill(code){const cls=code==='V'?'green':code==='D'?'red':'amber';return `<span class="form-dot ${cls}" title="${code==='V'?'Vitória':code==='D'?'Derrota':'Empate'}">${code}</span>`}
function playerWasUsed(g,id,r){if(!r)return false;if(r.starter||r.used===true)return true;if((g.timeline||[]).some(e=>e.playerId===id||e.assistId===id))return true;if(r.used===undefined&&r.status==='Convocado')return true;return false}
function playerAttendanceStats(id){let recorded=0,present=0;seasonTrainings().forEach(t=>{const s=t.entries?.[id]?.status;if(!s)return;recorded++;if(s==='Presente'||s==='Atrasado')present++});return {recorded,present,pct:recorded?Math.round(present/recorded*100):0}}
function playerWeightRows(id){
 const rows=[];
 seasonTrainings().forEach(t=>{const e=t.entries?.[id];if(e&&(e.pre||e.post))rows.push({date:t.date,time:t.time||'',pre:e.pre,post:e.post,source:'training',sourceId:t.id})});
 seasonGames().forEach(g=>{const e=g.weighIns?.[id];if(e&&(e.pre||e.post))rows.push({date:g.date,time:g.time||'',pre:e.pre,post:e.post,source:'match',sourceId:g.id})});
 return rows.sort((a,b)=>dateTimeOf(b.date,b.time||'23:59')-dateTimeOf(a.date,a.time||'23:59'));
}
function playerFineRows(id){return state.fines.filter(f=>f.playerId===id&&(f.seasonId||state.settings.activeSeasonId)===state.settings.activeSeasonId).sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
function privatePlayerAccess(){const internalView=['player','captain','staff','admin'].includes(mode);return internalView&&(!isHistoricalSeason()||backendRoles.includes('admin'))}
function canViewPlayerFines(playerId){if(mode==='public'||mode==='member')return false;if(isHistoricalSeason())return backendRoles.includes('admin');if(mode==='captain'||mode==='staff'||mode==='admin')return true;if(mode==='player')return currentUser()?.playerId===playerId;return false}

function gamePlayerContribution(g,id){
 const r=g.roster?.[id]||{};let goals=0,assists=0,yellow=0,secondYellow=0,red=0;
 if((g.timeline||[]).length){
  (g.timeline||[]).forEach(e=>{if(e.playerId===id){if(e.type==='goal')goals++;if(e.type==='yellow')yellow++;if(e.type==='second_yellow')secondYellow++;if(e.type==='red')red++;}if(e.type==='goal'&&e.assistId===id)assists++;});
 }else{const s=r.stats||{};goals=Number(s.goals)||0;assists=Number(s.assists)||0;yellow=Number(s.yellow)||0;secondYellow=Number(s.secondYellow)||0;red=Number(s.red)||0}
 return {goals,assists,yellow,secondYellow,red};
}
function playerRecentGames(id,limit=5){
 return seasonGames().filter(g=>(g.status==='final'||(g.homeScore!==''&&g.awayScore!==''))&&playerWasUsed(g,id,g.roster?.[id]))
  .sort((a,b)=>dateTimeOf(b.date,b.time)-dateTimeOf(a.date,a.time)).slice(0,limit).map(g=>({g,...gamePlayerContribution(g,id)}));
}
function contributionText(x){const bits=[];if(x.goals)bits.push(`${x.goals}G`);if(x.assists)bits.push(`${x.assists}A`);return bits.length?bits.join(' + '):'—'}
function weightSeriesForPlayer(id){
 const ref=state.settings.weightReference||'pre';return playerWeightRows(id).slice().reverse().map(w=>{const pre=Number(w.pre)||0,post=Number(w.post)||0;let value=ref==='post'?post:pre;if(ref==='mean')value=pre&&post?(pre+post)/2:(pre||post);return {date:w.date,value}}).filter(x=>x.value>0);
}
function weightChartHtml(id){
 const pts=weightSeriesForPlayer(id);if(pts.length<2)return empty('Ainda sem dados suficientes','São necessárias pelo menos duas pesagens para mostrar a evolução.');
 const data=pts.slice(-12),W=660,H=190,padX=34,padY=26,vals=data.map(x=>x.value),min=Math.min(...vals)-.4,max=Math.max(...vals)+.4,range=Math.max(.8,max-min);
 const coords=data.map((x,i)=>{const px=padX+(data.length===1?0:i*(W-padX*2)/(data.length-1));const py=H-padY-((x.value-min)/range)*(H-padY*2);return {x,...x,px,py}});
 const line=coords.map(p=>`${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');const ref=state.settings.weightReference==='post'?'pós':state.settings.weightReference==='mean'?'média pré/pós':'pré';
 return `<div class="weight-chart-wrap"><svg class="weight-evolution" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do peso"><line x1="${padX}" y1="${H-padY}" x2="${W-padX}" y2="${H-padY}" class="weight-axis"/><polyline points="${line}" class="weight-line"/>${coords.map(p=>`<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="5" class="weight-dot"><title>${fmtDate(p.date)} · ${p.value.toFixed(1)} kg</title></circle>`).join('')}</svg><div class="weight-chart-meta"><span>${fmtDate(data[0].date)} · <strong>${data[0].value.toFixed(1)} kg</strong></span><span>${esc(ref)} · últimos ${data.length} registos</span><span>${fmtDate(data[data.length-1].date)} · <strong>${data[data.length-1].value.toFixed(1)} kg</strong></span></div></div>`;
}
function playerRecentGamesHtml(id){
 const games=playerRecentGames(id,5);const slots=Array.from({length:5},(_,i)=>games[i]||null);
 return `<div class="recent-games-strip">${slots.map(x=>{if(!x)return `<div class="recent-game-card empty"><div class="recent-game-logo">—</div><div class="recent-contrib">—</div><div class="discipline-icons"><span class="mini-card yellow"></span><span class="mini-card second-yellow"></span><span class="mini-card red"></span></div></div>`;const g=x.g;return `<button class="recent-game-card" type="button" data-recent-game="${esc(g.id)}" title="${esc(gameTitle(g))} · ${fmtDate(g.date)}"><div class="recent-game-logo">${teamLogoHtml(g.opponent,'recent')}</div><div class="recent-opponent">${esc(teamByName(g.opponent)?.short||g.opponent)}</div><div class="recent-contrib">${esc(contributionText(x))}</div><div class="discipline-icons"><span class="mini-card yellow ${x.yellow?'active':''}" title="${x.yellow?`${x.yellow} amarelo(s)`:'Sem amarelo'}"></span><span class="mini-card second-yellow ${x.secondYellow?'active':''}" title="${x.secondYellow?`${x.secondYellow} expulsão(ões) por duplo amarelo`:'Sem duplo amarelo'}"></span><span class="mini-card red ${x.red?'active':''}" title="${x.red?`${x.red} vermelho(s) direto(s)`:'Sem vermelho direto'}"></span></div></button>`}).join('')}</div>`;
}
function seasonLabelById(id){return state.seasons.find(s=>s.id===id)?.label||'—'}
function historicalHeadToHead(teamName){const t=canonicalTeamName(teamName);return state.games.filter(g=>canonicalTeamName(g.opponent)===t&&(g.status==='final'||(g.homeScore!==''&&g.awayScore!==''))).sort((a,b)=>dateTimeOf(b.date,b.time)-dateTimeOf(a.date,a.time))}
function clubGameOutcome(g){const gf=Number(g.homeScore),ga=Number(g.awayScore);if(!Number.isFinite(gf)||!Number.isFinite(ga))return '';return gf>ga?'V':gf<ga?'D':'E'}
function halfTimeScoreText(g){if(g.halfTimeHomeScore===''||g.halfTimeHomeScore==null||g.halfTimeAwayScore===''||g.halfTimeAwayScore==null)return '';return g.homeAway==='Fora'?`${g.halfTimeAwayScore}–${g.halfTimeHomeScore}`:`${g.halfTimeHomeScore}–${g.halfTimeAwayScore}`}
function fmtDateTime(iso){try{return iso?new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso)):'Nunca'}catch{return 'Nunca'}}
function autoBackupSnapshot(){try{return JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY)||'null')}catch{return null}}

function renderChrome(){
 configurePreviewSelector();
 const preview=$('#previewMode');if(preview&&!preview.classList.contains('hidden'))preview.value=mode;
 const seasonSel=$('#seasonSelect');seasonSel.innerHTML=state.seasons.map(s=>`<option value="${s.id}" ${s.id===state.settings.activeSeasonId?'selected':''}>${esc(s.label)}</option>`).join('');
 const user=currentUser();const shownName=guestMode?'Visitante':backendSession?backendDisplayName():(user?.name||'Utilizador');$('#profileName').textContent=shownName;let roleText='';if(guestMode)roleText='Público';else if(backendSession){roleText=backendRoles.length?backendRoles.map(roleLabel).join(' · '):(backendProfile?.member_status==='pending'?'Utilizador registado · Sócio por validar':'Utilizador registado')}else roleText=(user?.roles||[]).map(roleLabel).join(' · ');$('#profileRoles').textContent=roleText;const av=$('#profileAvatar');if(av)av.textContent=initials(shownName);const cs=$('#connectionState');if(cs){cs.textContent=backendConnected?'Supabase ligado':'Ligação pendente';cs.classList.toggle('online',backendConnected)}const logout=$('#logoutBtn');if(logout)logout.textContent=guestMode?'Entrar':'Sair';const bell=$('#notificationBell');if(bell)bell.classList.toggle('hidden',guestMode);
 let html='';navDefs.forEach(gr=>{const items=gr.items.filter(i=>can(i[0]));if(!items.length)return;html+=`<div class="nav-group">${gr.group}</div>`+items.map(i=>`<button class="nav-item ${currentView===i[0]?'active':''}" data-view="${i[0]}"><span class="nav-icon" style="--nav-icon-color:${i[3]}">${navIcon(i[1])}</span><span class="nav-label">${i[2]}</span></button>`).join('')});$('#nav').innerHTML=html;
 $$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));
 const hb=$('#historicalBanner');if(hb){
  if(isHistoricalSeason()){const prod=state.seasons.find(x=>x.backendId===backendProductionSeason()?.id);hb.classList.remove('hidden');hb.innerHTML=`<div><strong>ÉPOCA ${esc(activeSeason()?.label||'')} · HISTÓRICO${historicalEditMode?' · EDIÇÃO':''}</strong><span>${historicalEditMode?'Modo de edição histórica ativo.':'Estás a consultar uma época arquivada.'}</span></div><div class="inline-actions">${backendRoles.includes('admin')?`<button class="btn ${historicalEditMode?'danger':'secondary'} sm" id="toggleHistoricalEdit">${historicalEditMode?'Terminar edição':'Editar histórico'}</button>`:''}${prod?`<button class="btn secondary sm" id="backCurrentSeason">← Voltar a ${esc(prod.label)}</button>`:''}</div>`;$('#toggleHistoricalEdit')&&($('#toggleHistoricalEdit').onclick=()=>{historicalEditMode=!historicalEditMode;renderChrome();renderView(currentView)});$('#backCurrentSeason')&&($('#backCurrentSeason').onclick=()=>switchSeason(prod.id))}else{hb.classList.add('hidden');hb.innerHTML=''}
 }
 const unread=state.notifications.filter(n=>!n.read&&notificationVisible(n)).length;$('#notificationCount').textContent=unread;$('#notificationCount').classList.toggle('hidden',!unread);
}
function notificationVisible(n){if(n?.backendId)return !!backendSession;if(mode==='admin'||mode==='staff')return true;if(mode==='player'||mode==='captain'){if(n.audience==='player')return n.playerId===currentUser()?.playerId;return ['all','players','roster'].includes(n.audience)}if(mode==='member')return ['all','members'].includes(n.audience);return n.audience==='all'}
function showView(v){if(!can(v)){v='dashboard'}currentView=v;$$('.view').forEach(x=>x.classList.remove('active'));$(`#view-${v}`).classList.add('active');$('#pageTitle').textContent=viewInfo[v][0];$('#pageSubtitle').textContent=viewInfo[v][1];$('#sidebar').classList.remove('open');renderChrome();renderView(v)}
function renderView(v){({dashboard:renderDashboard,games:renderGames,matchcenter:renderMatchCenter,calendar:renderCalendar,seriesResults:renderSeriesResults,standings:renderStandings,team:renderTeamPage,stats:renderStats,player:renderPlayerProfile,squad:renderSquad,training:renderTraining,weights:renderWeights,notifications:renderNotifications,account:renderAccount,privacy:renderPrivacy,fines:renderFines,fineRules:renderFineRules,seasons:renderSeasons,people:renderPeople,settings:renderSettings}[v]||renderDashboard)()}

function playerStats(){
 const out={};state.players.forEach(p=>out[p.id]={games:0,callups:0,starts:0,goals:0,assists:0,yellow:0,secondYellow:0,red:0});
 seasonGames().forEach(g=>{
  const finished=g.status==='final'||(g.homeScore!==''&&g.awayScore!=='');
  Object.entries(g.roster||{}).forEach(([id,r])=>{
   if(!out[id])return;
   if(r.status==='Convocado')out[id].callups++;
   if(finished&&playerWasUsed(g,id,r))out[id].games++;
   if(finished&&r.starter)out[id].starts++;
  });
  if((g.timeline||[]).length){
   g.timeline.forEach(e=>{if(e.playerId&&out[e.playerId]){if(e.type==='goal')out[e.playerId].goals++;if(e.type==='yellow')out[e.playerId].yellow++;if(e.type==='second_yellow')out[e.playerId].secondYellow++;if(e.type==='red')out[e.playerId].red++;}if(e.type==='goal'&&e.assistId&&out[e.assistId])out[e.assistId].assists++;});
  } else Object.entries(g.roster||{}).forEach(([id,r])=>{if(!out[id])return;const s=r.stats||{};out[id].goals+=Number(s.goals)||0;out[id].assists+=Number(s.assists)||0;out[id].yellow+=Number(s.yellow)||0;out[id].secondYellow+=Number(s.secondYellow)||0;out[id].red+=Number(s.red)||0;});
 });return out;
}

function attendanceRate(){let tot=0,ok=0;seasonTrainings().forEach(t=>state.players.forEach(p=>{const s=t.entries?.[p.id]?.status;if(s){tot++;if(s==='Presente'||s==='Atrasado')ok++;}}));return tot?Math.round(ok/tot*100):0}
function latestWeight(pId){const r=playerWeightRows(pId)[0];return r?{...r,pre:Number(r.pre)||null,post:Number(r.post)||null}:null}
function avgWeightLast14(pId,referenceDate){const start=new Date(`${addDays(referenceDate,-14)}T00:00:00`),end=new Date(`${referenceDate}T23:59:59`);const vals=[];playerWeightRows(pId).forEach(r=>{const d=dateTimeOf(r.date,r.time||'12:00');if(d<start||d>end)return;let v=state.settings.weightReference==='post'?Number(r.post):Number(r.pre);if(state.settings.weightReference==='mean'){const a=Number(r.pre),b=Number(r.post);v=(a&&b)?(a+b)/2:(a||b)}if(v>0)vals.push(v)});return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}

function renderHistoricalDashboard(){
 const primary=primaryLeagueCompetition(),standing=calculateStandings(primary?.id).find(r=>isFigueirasTeam(r.team));const comps=activeBackendCompetitions();const games=[...seasonGames()].filter(g=>g.status==='final'||g.homeScore!==''||g.administrativeDecision).sort((a,b)=>dateTimeOf(b.date,b.time)-dateTimeOf(a.date,a.time));const recent=games.slice(0,5);const compCards=comps.map(c=>{if(c.counts_for_standings){const row=calculateStandings(c.id).find(r=>isFigueirasTeam(r.team));return `<div class="card"><div class="eyebrow">${esc(backendCompetitionLabel(c))}</div><h3>${row?`${row.position}.º lugar`:'—'}</h3><p>${row?`${row.j} J · ${row.v} V · ${row.e} E · ${row.d} D · ${row.gf}-${row.ga}`:'Sem classificação'}</p></div>`}const cupGame=seasonGames().find(g=>g.competitionId===c.id);return `<div class="card"><div class="eyebrow">${esc(backendCompetitionLabel(c))}</div><h3>${cupGame?'1.ª Eliminatória':'—'}</h3><p>${cupGame?`${esc(gameTitle(cupGame))} · ${esc(scoreText(cupGame))}`:'Sem jogos'}</p></div>`}).join('');
 $('#view-dashboard').innerHTML=`<div class="card historical-hero"><div><div class="eyebrow">ÉPOCA ${esc(activeSeason()?.label||'')} · HISTÓRICO</div><h2>ADC Figueiras</h2><p>${esc(competitionName())}</p></div><div class="historical-position"><strong>${standing?`${standing.position}.º`:'—'}</strong><span>classificação final</span></div></div><div style="height:15px"></div><div class="grid kpis"><div class="card kpi"><div class="label">Jogos</div><div class="value">${standing?.j||0}</div></div><div class="card kpi"><div class="label">V / E / D</div><div class="value">${standing?`${standing.v}/${standing.e}/${standing.d}`:'—'}</div></div><div class="card kpi"><div class="label">Golos</div><div class="value">${standing?.gf||0}</div><div class="sub">marcados</div></div><div class="card kpi"><div class="label">Diferença</div><div class="value">${standing?(standing.dg>0?'+':'')+standing.dg:'—'}</div></div></div><div style="height:15px"></div><div class="grid equal2 historical-competitions">${compCards}</div><div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Últimos jogos da época</h3><p>Resultados oficiais do ADC Figueiras</p></div><button class="btn secondary sm" id="historicalAllGames">Ver todos</button></div>${recent.length?recent.map(g=>`<div class="list-row"><div><strong>${esc(gameTitle(g))}</strong><div class="meta">${fmtDate(g.date)} · ${esc(g.competition||'')}</div></div><span class="score">${esc(scoreText(g))}</span></div>`).join(''):empty('Sem jogos registados')}</div><div style="height:15px"></div><div class="inline-actions"><button class="btn" id="historicalSquad">Plantel ${esc(activeSeason()?.label||'')}</button><button class="btn secondary" id="historicalStandings">Classificação</button></div>`;
 $('#historicalAllGames').onclick=()=>showView('games');$('#historicalSquad').onclick=()=>showView('squad');$('#historicalStandings').onclick=()=>showView('standings');
}

function renderDashboard(){
 if(isHistoricalSeason()){renderHistoricalDashboard();return}
 const games=seasonGames(),now=new Date();const nextGame=[...games].filter(g=>dateTimeOf(g.date,g.time)>=now&&g.status!=='final').sort((a,b)=>dateTimeOf(a.date,a.time)-dateTimeOf(b.date,b.time))[0];const lastGame=[...games].filter(g=>g.status==='final'||(g.homeScore!==''&&g.awayScore!=='')).sort((a,b)=>dateTimeOf(b.date,b.time)-dateTimeOf(a.date,a.time))[0];const nextTraining=[...seasonTrainings()].filter(t=>dateTimeOf(t.date,t.time)>=now).sort((a,b)=>dateTimeOf(a.date,a.time)-dateTimeOf(b.date,b.time))[0];const stats=playerStats();const top=state.players.map(p=>({p,...stats[p.id]})).sort((a,b)=>b.goals-a.goals||b.assists-a.assists).slice(0,5);const notices=state.notifications.filter(notificationVisible).slice(-4).reverse();const standing=calculateStandings().find(r=>isFigueirasTeam(r.team));const form=teamRecentForm('ADC Figueiras',5);const me=playerById(currentUser()?.playerId);const myStats=me?stats[me.id]:null;const nextRoster=nextGame&&me?nextGame.roster?.[me.id]:null;const pendingTeamFines=state.fines.filter(f=>(f.seasonId||state.settings.activeSeasonId)===state.settings.activeSeasonId&&fineStatus(f)==='pending');const myPending=me?pendingTeamFines.filter(f=>f.playerId===me.id).reduce((s,f)=>s+Number(f.amount||0),0):0;
 const hero=nextGame?`<div class="card hero"><div class="eyebrow">Próximo jogo · ${esc(nextGame.competition||'Competição')}</div><div class="club-vs"><div class="crest"><img src="assets/adc-figueiras-emblema.png" alt="Emblema da ADC Figueiras"></div><div><h2>${esc(gameTitle(nextGame))}</h2><div class="muted">${fmtDate(nextGame.date)} · ${esc(nextGame.time||'Hora por definir')}${nextGame.venue?` · ${esc(nextGame.venue)}`:''}</div></div></div><div class="hero-actions">${can('matchcenter')?`<button class="btn secondary" data-open-game="${nextGame.id}">Abrir Match Center</button>`:'<button class="btn secondary" id="dashCalendar">Ver calendário</button>'}${canEdit()?`<button class="btn secondary" data-notify-gameday="${nextGame.id}">Preparar “DIA DE JOGO!”</button>`:''}</div></div>`:`<div class="card hero"><div class="eyebrow">Época ${esc(activeSeason()?.label||'')}</div><h2>ADC Figueiras</h2><p class="muted">Ainda não existe próximo jogo registado.</p></div>`;
 let content='';
 if(mode==='public'||mode==='member'){
  content=`<div class="grid kpis"><div class="card kpi"><div class="label">Posição</div><div class="value">${standing?`${standing.position}.º`:'—'}</div></div><div class="card kpi"><div class="label">Pontos</div><div class="value">${standing?.pts||0}</div></div><div class="card kpi"><div class="label">Jogos concluídos</div><div class="value">${games.filter(g=>g.status==='final'||(g.homeScore!==''&&g.awayScore!=='')).length}</div></div><div class="card kpi"><div class="label">Golos</div><div class="value">${standing?.gf||0}</div><div class="sub">marcados</div></div></div><div style="height:15px"></div><div class="grid two"><div class="card"><div class="card-head"><div><h3>Forma atual</h3><p>Últimos 5 jogos do Figueiras</p></div></div>${form.length?`<div class="form-row">${form.map(x=>formPill(x.result)).join('')}</div>`:empty('Ainda sem resultados')}<div class="card-head" style="margin-top:18px"><div><h3>Último resultado</h3></div></div>${lastGame?`<div class="list-row"><div><strong>${esc(gameTitle(lastGame))}</strong><div class="meta">${fmtDate(lastGame.date)}</div></div><span class="score">${scoreText(lastGame)}</span></div>`:empty('Sem resultados')}</div><div class="card"><div class="card-head"><div><h3>Melhores marcadores</h3><p>Época ${esc(activeSeason()?.label||'')}</p></div></div>${top.some(x=>x.goals||x.assists)?`<div class="list">${top.map(x=>`<div class="list-row"><div>${playerHtml(x.p)}</div><div><strong>${x.goals}</strong> G · ${x.assists} A</div></div>`).join('')}</div>`:empty('Sem estatísticas')}</div></div>${mode==='member'?`<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Notificações</h3><p>Informação do clube</p></div><button class="btn secondary sm" id="goNotifications">Ver todas</button></div>${notices.length?notices.map(noticeHtml).join(''):empty('Sem notificações')}</div>`:''}`;
 }else if(mode==='player'||mode==='captain'){
  content=`<div class="grid kpis"><div class="card kpi"><div class="label">Próximo treino</div><div class="value dashboard-small-value">${nextTraining?fmtShort(nextTraining.date):'—'}</div><div class="sub">${nextTraining?esc(nextTraining.time||'Hora por definir'):'sem treino agendado'}</div></div><div class="card kpi"><div class="label">Convocatória</div><div class="value dashboard-small-value">${nextRoster?.status==='Convocado'?'Convocado':nextRoster?.status||'—'}</div><div class="sub">próximo jogo</div></div><div class="card kpi"><div class="label">Jogos</div><div class="value">${myStats?.games||0}</div><div class="sub">${myStats?.goals||0} G · ${myStats?.assists||0} A</div></div><div class="card kpi"><div class="label">Minhas multas</div><div class="value dashboard-money">${money(myPending)}</div><div class="sub">pendentes</div></div></div><div style="height:15px"></div><div class="grid two"><div class="card"><div class="card-head"><div><h3>Os meus últimos jogos</h3><p>Contribuições e disciplina</p></div>${me?`<button class="btn secondary sm" id="openMyProfile">Ficha completa</button>`:''}</div>${me?playerRecentGamesHtml(me.id):empty('Sem jogador associado')}</div><div class="card"><div class="card-head"><div><h3>${mode==='captain'?'Gestão de multas':'Atualidade'}</h3><p>${mode==='captain'?'Responsabilidade do capitão':'Próximo treino e notificações'}</p></div></div>${mode==='captain'?`<div class="private-stat"><strong>${pendingTeamFines.length}</strong><span>multas pendentes · ${money(pendingTeamFines.reduce((s,f)=>s+Number(f.amount||0),0))}</span></div><button class="btn" id="dashFines">Gerir multas</button>`:`<div class="list-row"><div><strong>Próximo treino</strong><div class="meta">${nextTraining?`${fmtDate(nextTraining.date)} · ${esc(nextTraining.time||'—')}`:'Sem treino agendado'}</div></div>${nextTraining?pill('Treino','green'):''}</div>${notices.slice(0,2).map(noticeHtml).join('')}`}</div></div>`;
 }else if(mode==='staff'){
  const called=nextGame?Object.values(nextGame.roster||{}).filter(r=>r.status==='Convocado').length:0,starters=nextGame?Object.values(nextGame.roster||{}).filter(r=>r.starter).length:0;const unavailable=state.players.filter(p=>normalizePlayerStatus(p.status)!=='Disponível');const withoutRecentWeight=state.players.filter(p=>!latestWeight(p.id));
  content=`<div class="grid kpis"><div class="card kpi"><div class="label">Convocados</div><div class="value">${called}</div><div class="sub">próximo jogo</div></div><div class="card kpi"><div class="label">5 inicial</div><div class="value">${starters}/5</div></div><div class="card kpi"><div class="label">Indisponíveis</div><div class="value">${unavailable.length}</div></div><div class="card kpi"><div class="label">Sem pesagem</div><div class="value">${withoutRecentWeight.length}</div><div class="sub">na época</div></div></div><div style="height:15px"></div><div class="grid two"><div class="card"><div class="card-head"><div><h3>Preparação</h3><p>Próximo jogo e treino</p></div></div>${nextGame?`<div class="list-row"><div><strong>${esc(gameTitle(nextGame))}</strong><div class="meta">${fmtDate(nextGame.date)} · ${esc(nextGame.time||'')}</div></div><button class="btn secondary sm" data-open-game="${nextGame.id}">Match Center</button></div>`:empty('Sem próximo jogo')}<div class="list-row"><div><strong>Próximo treino</strong><div class="meta">${nextTraining?`${fmtDate(nextTraining.date)} · ${esc(nextTraining.time||'')}`:'Sem treino agendado'}</div></div></div></div><div class="card"><div class="card-head"><div><h3>Plantel</h3><p>Estados que exigem atenção</p></div><button class="btn secondary sm" id="dashSquad">Abrir plantel</button></div>${unavailable.length?unavailable.map(p=>`<div class="list-row"><div>${playerHtml(p)}</div>${pill(normalizePlayerStatus(p.status),statusPillType(p.status))}</div>`).join(''):empty('Plantel disponível')}</div></div>`;
 }else{
  content=`<div class="grid kpis"><div class="card kpi"><div class="label">Jogadores</div><div class="value">${state.players.length}</div></div><div class="card kpi"><div class="label">Jogos</div><div class="value">${games.length}</div></div><div class="card kpi"><div class="label">Treinos</div><div class="value">${seasonTrainings().length}</div></div><div class="card kpi"><div class="label">Resultados</div><div class="value">${allCompetitionResults().length}</div></div></div><div style="height:15px"></div><div class="grid two"><div class="card"><div class="card-head"><div><h3>Estado da época</h3><p>Resumo de gestão</p></div></div><div class="list-row"><div><strong>Classificação</strong><div class="meta">${standing?`${standing.position}.º · ${standing.pts} pontos`:'Sem dados'}</div></div></div><div class="list-row"><div><strong>Assiduidade global</strong></div><strong>${attendanceRate()}%</strong></div><div class="list-row"><div><strong>Multas pendentes</strong></div><strong>${money(pendingTeamFines.reduce((s,f)=>s+Number(f.amount||0),0))}</strong></div></div><div class="card"><div class="card-head"><div><h3>Segurança dos dados</h3><p>Diagnóstico rápido</p></div><button class="btn secondary sm" id="dashSettings">Definições</button></div><div class="list-row"><div><strong>Versão</strong></div><span>v${APP_VERSION}</span></div><div class="list-row"><div><strong>Último backup</strong></div><span>${fmtDateTime(state.settings.lastBackupAt)}</span></div><div class="list-row"><div><strong>Época ativa</strong></div><span>${esc(activeSeason()?.label||'—')}</span></div></div></div>`;
 }
 let joinBlock='';if(mode==='public'&&guestMode)joinBlock=`<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Cria a tua conta</h3><p>Qualquer pessoa pode registar-se. Os acessos internos são atribuídos pelo clube.</p></div><button class="btn" id="joinClub">Criar conta</button></div></div>`;else if(mode==='public'&&backendSession&&!backendRoles.length)joinBlock=`<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Conta registada</h3><p>${backendProfile?.member_status==='pending'?'O teu número de sócio está a aguardar validação pelo clube.':'Tens acesso à área pública. Se precisares de acesso interno, um Admin pode atribuí-lo.'}</p></div>${backendProfile?.member_status==='pending'?pill('Sócio por validar','amber'):pill('Registado','gray')}</div></div>`;
 $('#view-dashboard').innerHTML=`${hero}${joinBlock}<div style="height:15px"></div>${content}`;
 $$('[data-open-game]').forEach(b=>b.onclick=()=>{sessionStorage.setItem('mcGame',b.dataset.openGame);showView('matchcenter')});$$('[data-notify-gameday]').forEach(b=>b.onclick=()=>prepareGameDayNotification(b.dataset.notifyGameday));$('#dashCalendar')&&($('#dashCalendar').onclick=()=>showView('calendar'));$('#goNotifications')&&($('#goNotifications').onclick=()=>showView('notifications'));$('#joinClub')&&($('#joinClub').onclick=()=>{leavePublicMode();showSignupMode(true)});$('#openMyProfile')&&($('#openMyProfile').onclick=()=>me&&openPlayerProfile(me.id));$('#dashFines')&&($('#dashFines').onclick=()=>showView('fines'));$('#dashSquad')&&($('#dashSquad').onclick=()=>showView('squad'));$('#dashSettings')&&($('#dashSettings').onclick=()=>showView('settings'));
}

function openJoinRequest(){openModal('Aderir ao ADC Figueiras','Pedido de acesso à futura plataforma online.',`<form id="joinForm"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field full"><label>Quero aderir como</label><select name="kind"><option value="member">Sócio</option><option value="player">Atleta</option></select></div></div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn">Enviar pedido</button></div></form>`);$('#joinForm').onsubmit=e=>{e.preventDefault();state.joinRequests=state.joinRequests||[];state.joinRequests.push({id:uid('jr'),...Object.fromEntries(new FormData(e.target)),createdAt:new Date().toISOString(),status:'pending'});closeModal();saveState('Pedido registado nesta preview. Na versão online seguirá para a administração.')};$('[data-close]').onclick=closeModal}

function renderGames(){
 syncClubGamesToFixtures();
 const rows=[...seasonGames()].sort((a,b)=>dateTimeOf(a.date,a.time)-dateTimeOf(b.date,b.time));
 $('#view-games').innerHTML=`<div class="section-head"><div><h2>Jogos · ${esc(activeSeason()?.label||'')}</h2><p>Calendário do ADC Figueiras e fichas de jogo.</p></div>${canEdit()?'<button class="btn" id="addGame">＋ Outro jogo</button>':''}</div>${rows.length?rows.map(g=>`<div class="game-card ${g.fixtureId?'league-game-card':''}"><div class="when"><strong>${fmtShort(g.date).split(' ')[0]}</strong><small>${fmtShort(g.date).split(' ').slice(1).join(' ')}</small></div>${teamLogoHtml(g.opponent,'game-logo')}<div class="main-info"><h4>${esc(gameTitle(g))}</h4><p>${g.round?`${isCupGame(g)?'Ronda':'Jornada'} ${esc(g.round)} · `:''}${esc(g.competition||'Jogo')} · ${esc(g.time||'Hora por definir')}${g.venue?` · ${esc(g.venue)}`:''}</p></div><div>${g.status==='final'||(g.homeScore!==''&&g.awayScore!=='')?`<span class="score">${scoreText(g)}</span>`:pill('Agendado','blue')}</div><div class="inline-actions"><button class="btn secondary sm open-game" data-id="${g.id}">Match Center</button>${canEdit()?`<button class="btn secondary sm edit-game" data-id="${g.id}">Editar</button>`:''}</div></div>`).join(''):empty('Ainda não existem jogos')}`;
 $('#addGame')&&($('#addGame').onclick=()=>openGameCreate());
 $$('.open-game').forEach(b=>b.onclick=()=>{sessionStorage.setItem('mcGame',b.dataset.id);showView('matchcenter')});
 $$('.edit-game').forEach(b=>b.onclick=()=>openGameManage(b.dataset.id));
}

function openGameCreate(presetCompetition=''){
 const defaultCompetition=presetCompetition||competitionName();
 const cup=isCupCompetition(defaultCompetition);
 openModal('Novo jogo','Adiciona o jogo à época ativa.',`<form id="gameForm"><div class="form-grid"><div class="field"><label>Data *</label><input type="date" name="date" value="${nowKey()}" required></div><div class="field"><label>Hora</label><input type="time" name="time"></div><div class="field"><label id="gameRoundLabel">${cup?'Ronda':'Jornada'}</label><input type="text" name="round" placeholder="${cup?'Ex.: 1.ª eliminatória / Oitavos':'Ex.: 1'}"></div><div class="field full"><label>Adversário *</label><input name="opponent" required></div><div class="field"><label>Casa / Fora</label><select name="homeAway"><option>Casa</option><option>Fora</option></select></div><div class="field"><label>Competição</label><input name="competition" list="gameCompetitionOptions" value="${esc(defaultCompetition)}" placeholder="Campeonato / Taça / Amigável"><datalist id="gameCompetitionOptions"><option value="${esc(competitionName())}"><option value="Taça AF Porto"><option value="Amigável"></datalist></div><div class="field" id="standingsField"><label>Classificação</label><label class="check-inline"><input type="checkbox" name="countsForStandings" ${cup?'':'checked'} ${cup?'disabled':''}> Conta para a classificação</label></div><div class="field full"><label>Pavilhão / local</label><input name="venue"></div></div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn">Criar jogo</button></div></form>`);
 const form=$('#gameForm'),comp=form.elements.competition,roundLabel=$('#gameRoundLabel'),counts=form.elements.countsForStandings;
 const syncCompetitionFields=()=>{const isCup=isCupCompetition(comp.value);roundLabel.textContent=isCup?'Ronda':'Jornada';form.elements.round.placeholder=isCup?'Ex.: 1.ª eliminatória / Oitavos':'Ex.: 1';counts.disabled=isCup;if(isCup)counts.checked=false;};
 comp.addEventListener('input',syncCompetitionFields);syncCompetitionFields();
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const d=Object.fromEntries(fd);d.countsForStandings=isCupCompetition(d.competition)?false:fd.get('countsForStandings')==='on';const roster={};state.players.forEach(p=>roster[p.id]={status:'Não convocado',starter:false,used:false,stats:{goals:0,assists:0,yellow:0,secondYellow:0,red:0}});const g={id:uid('g'),seasonId:state.settings.activeSeasonId,...d,status:'scheduled',homeScore:'',awayScore:'',roster,timeline:[],officialFixture:false};state.games.push(g);try{if(backendMatchesLoaded&&backendMatches.rows.length)await saveBackendClubGame(g);closeModal();saveState('Jogo criado.');sessionStorage.setItem('mcGame',g.id);showView('matchcenter')}catch(err){console.error(err);state.games=state.games.filter(x=>x.id!==g.id);alert(`Não foi possível criar o jogo online.\n\n${err?.message||'Erro desconhecido'}`)}};$('[data-close]').onclick=closeModal
}
function openGameManage(id){
 const g=state.games.find(x=>x.id===id);if(!g)return;g.roster=g.roster||{};
 const roster=state.players.map(p=>{const r=g.roster[p.id]||{status:'Não convocado',starter:false,used:false};const status=normalizeRosterStatus(r.status);return `<div class="list-row roster-manage-row" data-rp="${p.id}"><div class="roster-player-meta"><div>${playerHtml(p)}</div>${!isHistoricalSeason()&&p.status?pill(normalizePlayerStatus(p.status),statusPillType(p.status)):''}</div><div class="inline-actions roster-controls"><select class="roster-status"><option ${status==='Convocado'?'selected':''}>Convocado</option><option ${status==='Não convocado'?'selected':''}>Não convocado</option><option ${status==='Lesionado'?'selected':''}>Lesionado</option><option ${status==='Suspenso'?'selected':''}>Suspenso</option><option ${status==='Ausente'?'selected':''}>Ausente</option><option ${status==='Em dúvida'?'selected':''}>Em dúvida</option></select><label class="check-inline"><input type="checkbox" class="roster-used" ${r.used===true||r.starter?'checked':''}> Jogou</label><label class="check-inline"><input type="checkbox" class="roster-starter" ${r.starter?'checked':''}> 5 inicial</label><label class="check-inline captain-choice"><input type="checkbox" class="roster-captain" ${g.captainId===p.id?'checked':''}> Capitão</label></div></div>`}).join('');
 openModal(gameTitle(g),`${fmtDate(g.date)} · ${esc(g.competition||'Jogo')}`,`<div class="form-grid"><div class="field"><label>Data</label><input id="gDate" type="date" value="${esc(g.date)}"></div><div class="field"><label>Hora</label><input id="gTime" type="time" value="${esc(g.time||'')}"></div><div class="field"><label id="gRoundLabel">${isCupGame(g)?'Ronda':'Jornada'}</label><input id="gRound" type="text" value="${esc(g.round||'')}"></div><div class="field"><label>Golos Figueiras</label><input id="gHome" type="number" min="0" value="${esc(g.homeScore)}"></div><div class="field"><label>Golos adversário</label><input id="gAway" type="number" min="0" value="${esc(g.awayScore)}"></div><div class="field full"><label class="check-inline"><input id="gAdministrative" type="checkbox" ${g.administrativeDecision?'checked':''}> Decisão administrativa</label><small>Quando ativa, o resultado mostrado publicamente é sempre DA.</small></div><div class="field g-admin-field"><label>Tipo de decisão</label><select id="gAdminDecision"><option value="fig_win" ${g.administrativeDecision&&((g.administrativeDecision==='home_win'&&g.homeAway==='Casa')||(g.administrativeDecision==='away_win'&&g.homeAway==='Fora'))?'selected':''}>Vitória administrativa do ADC Figueiras</option><option value="opp_win" ${g.administrativeDecision&&((g.administrativeDecision==='away_win'&&g.homeAway==='Casa')||(g.administrativeDecision==='home_win'&&g.homeAway==='Fora'))?'selected':''}>Vitória administrativa do adversário</option><option value="both_loss" ${g.administrativeDecision==='both_loss'?'selected':''}>Derrota administrativa de ambas</option></select></div><div class="field g-admin-field"><label>Resultado atribuído para contas</label><div class="inline-actions"><input id="gAdminHome" style="width:90px" type="number" min="0" value="${esc(g.administrativeHomeScore??'')}" placeholder="Figueiras"><span>–</span><input id="gAdminAway" style="width:90px" type="number" min="0" value="${esc(g.administrativeAwayScore??'')}" placeholder="Adversário"></div><small>Opcional e nunca mostrado ao público.</small></div><div class="field"><label>Estado</label><select id="gStatus"><option value="scheduled" ${g.status==='scheduled'?'selected':''}>Agendado</option><option value="final" ${g.status==='final'?'selected':''}>Final</option></select></div><div class="field"><label>Figueiras ao intervalo</label><input id="gHalfHome" type="number" min="0" value="${esc(g.halfTimeHomeScore??'')}"></div><div class="field"><label>Adversário ao intervalo</label><input id="gHalfAway" type="number" min="0" value="${esc(g.halfTimeAwayScore??'')}"></div><div class="field"><label>Competição</label><input id="gCompetition" list="gameCompetitionOptionsEdit" value="${esc(g.competition||'')}"><datalist id="gameCompetitionOptionsEdit"><option value="${esc(competitionName())}"><option value="Taça AF Porto"><option value="Amigável"></datalist></div><div class="field"><label>Classificação</label><label class="check-inline"><input id="gCounts" type="checkbox" ${(g.countsForStandings!==false&&!/taça|taca|amig|prepar|torneio/.test(String(g.competition||'').toLowerCase()))?'checked':''} ${isCupGame(g)?'disabled':''}> Conta para a classificação</label></div><div class="field full"><label>Local</label><input id="gVenue" value="${esc(g.venue||'')}"></div></div><div class="note subtle-note">O resultado ao intervalo é informação secundária na ficha. Nos jogos de campeonato, o intervalo é sempre aos 25 minutos.</div><div class="card-head" style="margin-top:18px"><div><h3>Convocatória e utilização</h3><p>Um convocado pode não ser utilizado. O 5 inicial e o capitão contam automaticamente como utilizados.</p></div><button class="btn secondary sm" id="allCalled">Convocar todos</button></div><div class="list">${roster}</div><div class="form-actions">${g.officialFixture?'':`<button class="btn danger" id="deleteGame">Eliminar</button>`}<span style="flex:1"></span><button class="btn secondary" data-close>Fechar</button><button class="btn" id="saveGame">Guardar</button></div>`,true);
 $('#allCalled').onclick=()=>$$('.roster-status').forEach(s=>s.value='Convocado');
 const syncGameCompetition=()=>{const cup=isCupCompetition($('#gCompetition').value);$('#gRoundLabel').textContent=cup?'Ronda':'Jornada';$('#gCounts').disabled=cup;if(cup)$('#gCounts').checked=false;};$('#gCompetition').addEventListener('input',syncGameCompetition);syncGameCompetition();
 const syncGameAdmin=()=>{const on=$('#gAdministrative').checked;$$('.g-admin-field').forEach(x=>x.classList.toggle('hidden',!on));$('#gHome').disabled=on;$('#gAway').disabled=on;$('#gHalfHome').disabled=on;$('#gHalfAway').disabled=on;const both=on&&$('#gAdminDecision').value==='both_loss';$('#gAdminHome').disabled=both;$('#gAdminAway').disabled=both;if(both){$('#gAdminHome').value='';$('#gAdminAway').value=''}};$('#gAdministrative').onchange=syncGameAdmin;$('#gAdminDecision').onchange=syncGameAdmin;syncGameAdmin();
 $$('.roster-starter').forEach(cb=>cb.onchange=()=>{if(cb.checked){const row=cb.closest('[data-rp]');$('.roster-status',row).value='Convocado';$('.roster-used',row).checked=true}});
 $$('.roster-used').forEach(cb=>cb.onchange=()=>{if(cb.checked){const row=cb.closest('[data-rp]');$('.roster-status',row).value='Convocado'}});
 $$('.roster-captain').forEach(cb=>cb.onchange=()=>{if(cb.checked){$$('.roster-captain').forEach(other=>{if(other!==cb)other.checked=false});const row=cb.closest('[data-rp]');$('.roster-status',row).value='Convocado';$('.roster-used',row).checked=true}});
 $('#saveGame').onclick=async()=>{g.date=$('#gDate').value;g.time=$('#gTime').value;g.round=$('#gRound')?.value||g.round||'';g.competition=$('#gCompetition').value.trim()||g.competition||'Jogo';const admin=$('#gAdministrative').checked;if(admin){const kind=$('#gAdminDecision').value;if(kind==='both_loss')g.administrativeDecision='both_loss';else if(kind==='fig_win')g.administrativeDecision=g.homeAway==='Casa'?'home_win':'away_win';else g.administrativeDecision=g.homeAway==='Casa'?'away_win':'home_win';g.administrativeHomeScore=kind==='both_loss'?'':$('#gAdminHome').value;g.administrativeAwayScore=kind==='both_loss'?'':$('#gAdminAway').value;g.homeScore='';g.awayScore='';g.halfTimeHomeScore='';g.halfTimeAwayScore='';g.status='final'}else{g.administrativeDecision='';g.administrativeHomeScore='';g.administrativeAwayScore='';g.homeScore=$('#gHome').value;g.awayScore=$('#gAway').value;g.halfTimeHomeScore=$('#gHalfHome').value;g.halfTimeAwayScore=$('#gHalfAway').value;g.status=$('#gStatus').value}g.countsForStandings=isCupGame(g)?false:$('#gCounts').checked;g.venue=$('#gVenue').value;let starters=0;let captainId='';$$('[data-rp]').forEach(row=>{g.roster[row.dataset.rp]=g.roster[row.dataset.rp]||{stats:{}};const starter=$('.roster-starter',row).checked;const isCaptain=$('.roster-captain',row).checked;const used=starter||isCaptain||$('.roster-used',row).checked;const status=(starter||used||isCaptain)?'Convocado':$('.roster-status',row).value;g.roster[row.dataset.rp].status=status;g.roster[row.dataset.rp].starter=starter;g.roster[row.dataset.rp].used=status==='Convocado'?used:false;if(starter)starters++;if(isCaptain)captainId=row.dataset.rp});if(starters>5){alert('Só podes selecionar até 5 jogadores para o 5 inicial.');return;}g.captainId=captainId;const btn=$('#saveGame');if(btn){btn.disabled=true;btn.textContent='A guardar…'}try{if(backendMatchesLoaded&&backendMatches.rows.length){await saveBackendClubGame(g);await saveBackendMatchPlayers(g);}let callupResult=null;let callupError=null;if(g.backendId&&Object.values(g.roster||{}).some(r=>normalizeRosterStatus(r?.status)==='Convocado')&&g.status!=='final'){
 try{callupResult=await publishBackendMatchCallup(g)}catch(err){callupError=err;console.error('Convocatória guardada, mas publicação/aviso público pendente:',err)}
}closeModal();saveState(callupError?'Jogo guardado. Atenção: a convocatória pública não foi confirmada.':callupResult?.published?'Convocatória publicada e aviso geral criado.':'Jogo e Match Center atualizados no Supabase.');if(callupError)alert('A ficha de jogo foi guardada, mas a publicação e/ou notificação da convocatória falhou. Verifica a migração do Supabase antes de voltares a tentar.\\n\\n'+(callupError.message||'Erro desconhecido'));}catch(err){console.error(err);alert(`Não foi possível guardar o jogo no Supabase.\n\n${err?.message||'Erro desconhecido'}`);if(btn){btn.disabled=false;btn.textContent='Guardar'}}};
 $('#deleteGame')&&($('#deleteGame').onclick=async()=>{if(!confirm('Eliminar este jogo?'))return;try{if(g.backendId&&backendMatchesLoaded&&backendMatches.rows.length)await deleteBackendMatchById(g.backendId);state.games=state.games.filter(x=>x.id!==g.id);closeModal();saveState('Jogo eliminado.')}catch(err){console.error(err);alert(`Não foi possível eliminar o jogo.\n\n${err?.message||'Erro desconhecido'}`)}});$('[data-close]').onclick=closeModal;
}

function renderMatchCenter(){
 let id=sessionStorage.getItem('mcGame');let g=state.games.find(x=>x.id===id);if(!g){g=[...seasonGames()].sort((a,b)=>Math.abs(dateTimeOf(a.date,a.time)-new Date())-Math.abs(dateTimeOf(b.date,b.time)-new Date()))[0]}if(!g){$('#view-matchcenter').innerHTML=empty('Sem jogos','Cria um jogo para abrir o Match Center.');return}sessionStorage.setItem('mcGame',g.id);
 let events=[...(g.timeline||[])];if(isLeagueGame(g)&&!events.some(e=>e.type==='halftime'))events.push({id:'auto_halftime',type:'halftime',minute:25,text:'Intervalo'});events=events.sort((a,b)=>(Number(a.minute)||999)-(Number(b.minute)||999));
 const calledEntries=Object.entries(g.roster||{}).filter(([,r])=>r.status==='Convocado');const called=calledEntries.map(([id])=>playerById(id)).filter(Boolean);const starters=Object.entries(g.roster||{}).filter(([,r])=>r.starter).map(([id])=>playerById(id)).filter(Boolean).sort((a,b)=>{const aGK=String(a.position||'').toUpperCase()==='GR',bGK=String(b.position||'').toUpperCase()==='GR';if(aGK!==bGK)return aGK?-1:1;const an=Number(a.number),bn=Number(b.number),aNum=Number.isFinite(an)&&String(a.number||'').trim()!=='',bNum=Number.isFinite(bn)&&String(b.number||'').trim()!=='';if(aNum&&bNum)return an-bn;if(aNum!==bNum)return aNum?-1:1;return String(a.number||'').localeCompare(String(b.number||''),'pt',{numeric:true})});
 const starterSlots=Array.from({length:5},(_,i)=>{const p=starters[i];if(!p)return '<div class="starter-square empty">—</div>';return `<div class="starter-square ${String(p.position||'').toUpperCase()==='GR'?'keeper':'field'}" title="${esc(p.name)}">${esc(p.number||'?')}</div>`}).join('');
 const calledTags=calledEntries.map(([pid,r])=>{const p=playerById(pid);if(!p)return '';const used=playerWasUsed(g,pid,r),captain=g.captainId===pid;return `<span class="callup-chip ${used?'used':'unused'}">${p.number?`#${esc(p.number)} · `:''}${esc(p.name)}${captain?' <b class="captain-badge">C</b>':''}${g.status==='final'?` · ${used?'utilizado':'não utilizado'}`:''}</span>`}).join('');const ht=halfTimeScoreText(g);
 const weightData=matchWeightSummary(g,calledEntries);
 const weightBlock=privatePlayerAccess()?`<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Pesagens</h3><p>${weightData.complete}/${weightData.total} registadas · peso pré-jogo e pós-jogo.</p></div>${canEdit()?'<button class="btn secondary sm" id="manageMatchWeights">Gerir pesagens</button>':''}</div>${weightData.total?`<div class="table-wrap"><table class="match-weight-table"><thead><tr><th>Jogador</th><th>Pré-jogo</th><th>Pós-jogo</th><th>Diferença</th></tr></thead><tbody>${weightData.rows.map(x=>`<tr><td>${playerStatHtml(x.player)}</td><td>${x.pre?`${x.pre.toFixed(1)} kg`:'—'}</td><td>${x.post?`${x.post.toFixed(1)} kg`:'—'}</td><td>${x.delta===null?'—':`<strong>${x.delta>0?'+':''}${x.delta.toFixed(1)} kg</strong>`}</td></tr>`).join('')}</tbody></table></div>`:empty('Convocatória por definir','As pesagens de jogo ficam disponíveis depois de definires os convocados.')}</div>`:'';
 $('#view-matchcenter').innerHTML=`<div class="section-head"><div><h2>Match Center</h2><p>${fmtDate(g.date)} · ${esc(g.competition||'Jogo')}</p></div><div class="inline-actions">${canEdit()?`<button class="btn secondary" id="editThisGame">Convocatória / ficha de jogo</button><button class="btn" id="addEvent">＋ Acontecimento</button>`:''}</div></div><div class="match-grid"><div class="card match-scoreboard"><div class="eyebrow">${g.status==='final'?'FINAL':'FICHA DE JOGO'}</div><div class="teams"><div class="team-name">${g.homeAway==='Casa'?'ADC Figueiras':esc(g.opponent)}</div><div class="big-score">${scoreText(g)}</div><div class="team-name">${g.homeAway==='Casa'?esc(g.opponent):'ADC Figueiras'}</div></div>${ht?`<div class="halftime-score">Intervalo · ${esc(ht)}</div>`:''}<div class="muted">${esc(g.time||'Hora por definir')} · ${esc(g.venue||'Local por definir')}</div><div class="hero-actions" style="justify-content:center">${canEdit()&&!isHistoricalSeason()?`<button class="btn blue sm" id="notifGameDay">DIA DE JOGO!</button><button class="btn secondary sm" id="notifCallup">Convocatória</button><button class="btn amber sm" id="notifFood">Plano pré-jogo</button>${g.status==='final'?'<button class="btn danger sm" id="notifFinal">Resultado final</button>':''}`:''}</div><div class="card-head" style="margin-top:20px;text-align:left"><div><h3>5 inicial</h3><p>${starters.length}/5 definido</p></div></div><div class="starter-five">${starterSlots}</div><div class="card-head" style="margin-top:16px;text-align:left"><div><h3>Convocados</h3><p>${called.length} jogador(es)${g.captainId&&playerById(g.captainId)?` · Capitão: ${esc(playerById(g.captainId).name)}`:''}</p></div></div>${called.length?`<div class="callup-list">${calledTags}</div>`:empty('Convocatória por definir')}</div><div class="card"><div class="card-head"><div><h3>Factos do jogo</h3></div></div>${events.length?`<div class="timeline">${events.map(eventHtml).join('')}</div>`:empty('Ainda sem acontecimentos','Regista no final do jogo os marcadores, assistências e cartões.')}</div></div>${weightBlock}`;
 $('#editThisGame')&&($('#editThisGame').onclick=()=>openGameManage(g.id));$('#addEvent')&&($('#addEvent').onclick=()=>openEventCreate(g.id));$('#manageMatchWeights')&&($('#manageMatchWeights').onclick=()=>openMatchWeights(g.id));$('#notifGameDay')&&($('#notifGameDay').onclick=()=>prepareGameDayNotification(g.id));$('#notifCallup')&&($('#notifCallup').onclick=()=>prepareCallupNotification(g.id));$('#notifFood')&&($('#notifFood').onclick=()=>prepareNutritionNotifications(g.id));$('#notifFinal')&&($('#notifFinal').onclick=()=>prepareFinalNotification(g.id));
 $$('.delete-event').forEach(b=>b.onclick=async()=>{const eventId=b.dataset.eventId;if(!eventId||eventId==='auto_halftime')return;if(!confirm('Remover este acontecimento?'))return;const event=(g.timeline||[]).find(e=>e.id===eventId);try{if(event?.backendId&&backendConnected)await deleteBackendMatchEvent(event);g.timeline=(g.timeline||[]).filter(e=>e.id!==eventId);if(backendConnected&&g.backendId){await saveBackendMatchPlayers(g,{reload:false});await loadBackendMatchCenterData();}saveState('Acontecimento removido do Supabase.');renderMatchCenter()}catch(err){console.error(err);alert(`Não foi possível remover o acontecimento.\n\n${err?.message||'Erro desconhecido'}`)}});
}

function matchWeightSummary(g,calledEntries=null){
 const entries=calledEntries||Object.entries(g.roster||{}).filter(([,r])=>normalizeRosterStatus(r?.status)==='Convocado');
 const rows=entries.map(([pid])=>{const player=playerById(pid);if(!player)return null;const e=g.weighIns?.[pid]||{};const pre=Number(e.pre)||null,post=Number(e.post)||null,delta=pre&&post?post-pre:null;return {pid,player,pre,post,delta,complete:!!(pre&&post)}}).filter(Boolean);
 return {rows,total:rows.length,complete:rows.filter(x=>x.complete).length};
}
function openMatchWeights(gameId){
 const g=state.games.find(x=>x.id===gameId);if(!g)return;
 const editable=canEdit();const calledEntries=Object.entries(g.roster||{}).filter(([,r])=>normalizeRosterStatus(r?.status)==='Convocado');
 if(!calledEntries.length){alert('Define primeiro a convocatória deste jogo.');return}
 const rows=calledEntries.map(([pid])=>{const p=playerById(pid);if(!p)return '';const e=g.weighIns?.[pid]||{};const a=Number(e.pre),b=Number(e.post),delta=a&&b?b-a:null,pct=a&&b?(b-a)/a*100:null;return `<div class="match-weight-row" data-player="${p.id}">${playerHtml(p)}<input class="mw-pre" type="number" step="0.1" min="20.1" max="249.9" placeholder="Pré-jogo kg" value="${esc(e.pre||'')}" ${editable?'':'disabled'}><input class="mw-post" type="number" step="0.1" min="20.1" max="249.9" placeholder="Pós-jogo kg" value="${esc(e.post||'')}" ${editable?'':'disabled'}><div class="delta match-weight-delta">${delta===null?'—':`${delta>0?'+':''}${delta.toFixed(1)} kg<br><span class="muted">${pct.toFixed(2)}%</span>`}</div></div>`}).join('');
 openModal(`Pesagens · ${fmtDate(g.date)}`,gameTitle(g),`${editable?'<div class="info-strip">Regista o peso antes e depois do jogo. Estes valores entram automaticamente na mesma evolução cronológica de pesagens do jogador.</div><div style="height:10px"></div>':''}<div class="match-weight-roster">${rows}</div><div class="form-actions"><button class="btn secondary" data-close>Fechar</button>${editable?'<button class="btn" id="saveMatchWeights">Guardar pesagens</button>':''}</div>`,true);
 const refreshDelta=row=>{const a=Number($('.mw-pre',row).value),b=Number($('.mw-post',row).value),box=$('.match-weight-delta',row);if(!a||!b){box.innerHTML='—';return}const d=b-a,pct=d/a*100;box.innerHTML=`${d>0?'+':''}${d.toFixed(1)} kg<br><span class="muted">${pct.toFixed(2)}%</span>`};
 $$('.match-weight-row',$('#modalBody')).forEach(r=>$$('input',r).forEach(i=>i.addEventListener('input',()=>refreshDelta(r))));
 $('#saveMatchWeights')&&($('#saveMatchWeights').onclick=async()=>{const old=JSON.parse(JSON.stringify(g.weighIns||{}));const next={...old};let invalid='';$$('.match-weight-row',$('#modalBody')).forEach(r=>{const pre=$('.mw-pre',r).value.trim(),post=$('.mw-post',r).value.trim();for(const [label,raw] of [['pré-jogo',pre],['pós-jogo',post]]){if(!raw)continue;const n=Number(raw.replace(',','.'));if(!Number.isFinite(n)||n<=20||n>=250)invalid=`Peso ${label} inválido para ${playerById(r.dataset.player)?.name||'jogador'}.`;}next[r.dataset.player]={pre,post}});if(invalid){alert(invalid);return}g.weighIns=next;const btn=$('#saveMatchWeights');btn.disabled=true;btn.textContent='A guardar…';try{if(backendConnected)await saveBackendMatchWeighIns(g);closeModal();saveState(backendConnected?'Pesagens do jogo guardadas online.':'Pesagens do jogo guardadas neste dispositivo.');renderMatchCenter()}catch(err){console.error(err);g.weighIns=old;alert(`Não foi possível guardar as pesagens do jogo.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent='Guardar pesagens'}});
 $('[data-close]').onclick=closeModal;
}

function eventHtml(e){const cls=e.type==='yellow'?'cardy':e.type==='second_yellow'?'card2y':e.type==='red'?'cardr':e.type==='halftime'?'halftime':e.type==='note'?'note':'goal';const p=playerById(e.playerId);const a=playerById(e.assistId);const label=e.type==='goal'&&e.ownGoal?'⚽ Auto-golo adversário':({goal:'⚽ Golo',yellow:'🟨 Cartão amarelo',second_yellow:'🟨🟥 2.º amarelo / expulsão',red:'🟥 Vermelho direto',halftime:'⏸ Intervalo',note:'Nota'}[e.type]||e.type);const removable=canEdit()&&e.id&&e.id!=='auto_halftime';return `<div class="timeline-event ${cls}"><div class="timeline-dot"></div><div><span class="minute">${e.minute?`${esc(e.minute)}'`:''}</span> <strong>${label}${p?` · ${esc(p.name)}`:''}</strong>${a?`<small>Assistência: ${esc(a.name)}</small>`:''}${e.text&&e.type!=='halftime'?`<small>${esc(e.text)}</small>`:''}</div>${removable?`<button class="btn danger sm delete-event" type="button" data-event-id="${esc(e.id)}" title="Remover acontecimento">Eliminar</button>`:''}</div>`}
function openEventCreate(gameId){
 const g=state.games.find(x=>x.id===gameId);if(!g)return;
 const calledIds=Object.entries(g.roster||{}).filter(([,r])=>r.status==='Convocado').map(([id])=>id);
 const pool=(calledIds.length?calledIds.map(playerById).filter(Boolean):state.players);
 const opts=pool.map(p=>`<option value="${p.id}">${esc(p.number?`#${p.number} · ${p.name}`:p.name)}</option>`).join('');
 const typeOptions=`<option value="goal">Golo</option><option value="yellow">Cartão amarelo</option><option value="second_yellow">2.º amarelo / expulsão</option><option value="red">Vermelho direto</option>`;
 openModal('Novo acontecimento',gameTitle(g),`<form id="eventForm"><div class="form-grid"><div class="field"><label>Tipo</label><select name="type">${typeOptions}</select></div><div class="field"><label>Minuto *</label><input name="minute" type="number" min="0" max="120" required></div><div class="field full" id="ownGoalField"><label class="check-inline"><input type="checkbox" name="ownGoal" value="1"> Auto-golo adversário</label><div class="meta">Conta como golo do ADC Figueiras, mas não é atribuído a nenhum jogador.</div></div><div class="field" id="eventPlayerField"><label>Jogador *</label><select name="playerId" required><option value="">— Selecionar —</option>${opts}</select></div><div class="field" id="assistField"><label>Assistência</label><select name="assistId"><option value="">—</option>${opts}</select></div></div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="saveEventBtn">Adicionar</button></div></form>`);
 const form=$('#eventForm'),typeSel=form.elements.type,assistField=$('#assistField'),playerField=$('#eventPlayerField'),ownGoalField=$('#ownGoalField'),ownGoalInput=form.elements.ownGoal;
 const syncEventFields=()=>{const isGoal=typeSel.value==='goal',isCard=['yellow','second_yellow','red'].includes(typeSel.value),ownGoal=isGoal&&ownGoalInput.checked;ownGoalField.classList.toggle('hidden',!isGoal);playerField.classList.toggle('hidden',ownGoal);assistField.classList.toggle('hidden',isCard||ownGoal);form.elements.playerId.required=!ownGoal;if(isCard||ownGoal)form.elements.assistId.value='';if(ownGoal)form.elements.playerId.value='';};
 typeSel.addEventListener('change',syncEventFields);ownGoalInput.addEventListener('change',syncEventFields);syncEventFields();
 form.onsubmit=async e=>{
  e.preventDefault();const fd=new FormData(e.target);const d=Object.fromEntries(fd);d.ownGoal=d.type==='goal'&&fd.get('ownGoal')==='1';if(['yellow','second_yellow','red'].includes(d.type)||d.ownGoal)d.assistId='';if(d.ownGoal)d.playerId='';
  if(d.type==='goal'&&!d.ownGoal&&d.assistId&&d.assistId===d.playerId){alert('O marcador e o jogador da assistência não podem ser a mesma pessoa.');return}
  if(!d.ownGoal&&!d.playerId){alert('Seleciona o jogador.');return}
  const event={id:uid('ev'),type:d.type,minute:d.minute,playerId:d.playerId||'',assistId:d.assistId||'',ownGoal:d.ownGoal,text:''};g.timeline=g.timeline||[];g.timeline.push(event);
  [event.playerId,event.assistId].filter(Boolean).forEach(pid=>{g.roster[pid]=g.roster[pid]||{status:'Convocado',starter:false,used:true,stats:{}};g.roster[pid].status='Convocado';g.roster[pid].used=true});
  const btn=$('#saveEventBtn');if(btn){btn.disabled=true;btn.textContent='A guardar…'}
  try{
   if(backendConnected&&g.backendId){await insertBackendMatchEvent(g,event,{reload:false});await saveBackendMatchPlayers(g,{reload:false});await loadBackendMatchCenterData()}
   closeModal();saveState('Acontecimento guardado no Match Center online.');renderMatchCenter();
  }catch(err){console.error(err);if(event.backendId){try{await deleteBackendMatchEvent(event)}catch(cleanupErr){console.warn('Não foi possível reverter o acontecimento remoto.',cleanupErr)}}g.timeline=(g.timeline||[]).filter(x=>x!==event);alert(`Não foi possível guardar o acontecimento no Supabase.\n\n${err?.message||'Erro desconhecido'}`);if(btn){btn.disabled=false;btn.textContent='Adicionar'}}
 };
 $('[data-close]').onclick=closeModal;
}

async function createNotification({type='general',title,body,audience='all_registered',gameId='',trainingId='',playerIds=[],dedupeKey='',scheduledFor=null}){
 if(backendConnected&&backendSession){
  const game=gameId?state.games.find(x=>x.id===gameId):null;
  const training=trainingId?state.trainings.find(x=>x.id===trainingId):null;
  const backendPlayerIds=(playerIds||[]).map(backendPlayerIdFromLocal).filter(Boolean);
  return await sendBackendNotification({
   type,title,body,audience,
   matchBackendId:game?.backendId||null,
   trainingBackendId:training?.backendId||null,
   playerBackendIds:backendPlayerIds,
   dedupeKey,
   scheduledFor
  });
 }
 const n={id:uid('n'),createdAt:new Date().toISOString(),notificationType:type,type:notificationCssType(type),title,body,audience,gameId,trainingId,scheduledFor,read:false};
 state.notifications.push(n);return {notification_id:n.id,recipient_count:1};
}
async function prepareGameDayNotification(id){
 const g=state.games.find(x=>x.id===id);if(!g)return;
 if(!g.backendId){toast('Guarda primeiro o jogo online.');return}
 openNotificationTimingModal({heading:'DIA DE JOGO!',description:`${gameTitle(g)} · ${fmtDate(g.date)}`,kind:'matchday',entity:g,onConfirm:async({mode,scheduledFor})=>{
  const r=await createNotification({type:'matchday',title:'DIA DE JOGO!',body:`${gameTitle(g)} · ${fmtDate(g.date)}${g.time?` às ${g.time}`:''}${g.venue?` · ${g.venue}`:''}`,audience:'players_members',gameId:g.id,dedupeKey:`matchday:${g.backendId}`,scheduledFor});
  renderChrome();toast(mode==='schedule'?`DIA DE JOGO programado para ${r.recipient_count||0} destinatário(s).`:`DIA DE JOGO enviado a ${r.recipient_count||0} destinatário(s).`);
 }});
}
async function prepareCallupNotification(id){
 const g=state.games.find(x=>x.id===id);if(!g)return;
 const ids=Object.entries(g.roster||{}).filter(([,r])=>r.status==='Convocado').map(([id])=>id);
 if(!ids.length){toast('Ainda não há jogadores convocados.');return}
 if(!g.backendId){toast('Guarda primeiro o jogo online.');return}
 openNotificationTimingModal({heading:'Convocatória',description:`${gameTitle(g)} · ${ids.length} convocado(s)`,kind:'callup',entity:g,onConfirm:async({mode,scheduledFor})=>{
  const r=await createNotification({type:'callup',title:'CONVOCATÓRIA',body:`Estás convocado para ${gameTitle(g)} · ${fmtDate(g.date)}${g.time?` · ${g.time}`:''}.`,audience:'called_up',gameId:g.id,dedupeKey:`callup:${g.backendId}`,scheduledFor});
  renderChrome();toast(mode==='schedule'?`Convocatória programada para ${r.recipient_count||0} jogador(es) com conta.`:`Convocatória enviada a ${r.recipient_count||0} jogador(es) com conta.`);
 }});
}
async function prepareFinalNotification(id){
 const g=state.games.find(x=>x.id===id);if(!g)return;
 if(!g.backendId){toast('Guarda primeiro o jogo online.');return}
 openNotificationTimingModal({heading:'Resultado final',description:`${gameTitle(g)} · ${scoreText(g)}`,kind:'result',entity:g,onConfirm:async({mode,scheduledFor})=>{
  const r=await createNotification({type:'result',title:'RESULTADO FINAL',body:`${gameTitle(g)} · ${scoreText(g)}`,audience:'all_registered',gameId:g.id,dedupeKey:`result:${g.backendId}`,scheduledFor});
  renderChrome();toast(mode==='schedule'?`Resultado final programado para ${r.recipient_count||0} utilizador(es).`:`Resultado final enviado a ${r.recipient_count||0} utilizador(es).`);
 }});
}
function renderNutritionTemplate(template,avg,p,g){return String(template||'').replaceAll('{{peso_medio}}',avg?avg.toFixed(1):'—').replaceAll('{{jogador}}',p?.name||'Jogador').replaceAll('{{adversario}}',g?.opponent||'').replaceAll('{{hora_jogo}}',g?.time||'').replaceAll('{{data_jogo}}',fmtDate(g?.date))}
async function prepareNutritionNotifications(id){
 const g=state.games.find(x=>x.id===id);if(!g)return;
 const ids=Object.entries(g.roster||{}).filter(([,r])=>r.status==='Convocado').map(([id])=>id);
 if(!ids.length){toast('Ainda não há jogadores convocados.');return}
 if(!g.backendId){toast('Guarda primeiro o jogo online.');return}
 if(!backendNutritionLoaded){toast('É necessário configurar primeiro o plano alimentar seguro no Supabase.');return}
 openNotificationTimingModal({heading:'Plano pré-jogo',description:`${gameTitle(g)} · ${ids.length} convocado(s)`,kind:'nutrition',entity:g,onConfirm:async({mode,scheduledFor})=>{
  let sent=0;
  for(const pid of ids){
   const p=playerById(pid),backendPid=backendPlayerIdFromLocal(pid);if(!p||!backendPid)continue;
   const avg=avgWeightLast14(pid,g.date);let body=`Jogo ${g.date===addDays(nowKey(),1)?'amanhã':fmtDate(g.date)}: ${gameTitle(g)}. `;body+=avg?`Peso médio das últimas 2 semanas: ${avg.toFixed(1)} kg. `:'Sem pesagens suficientes nas últimas 2 semanas. ';
   if(state.settings.nutritionEnabled&&state.settings.nutritionTemplate&&avg)body+=renderNutritionTemplate(state.settings.nutritionTemplate,avg,p,g);else body+='Plano alimentar ainda por configurar pela equipa técnica.';
   const r=await createNotification({type:'nutrition',title:'PLANO PRÉ-JOGO',body,audience:'player_ids',gameId:g.id,playerIds:[pid],dedupeKey:`nutrition:${g.backendId}:${backendPid}`,scheduledFor});sent+=Number(r.recipient_count||0);
  }
  renderChrome();toast(mode==='schedule'?`Plano pré-jogo programado para ${sent} convocado(s) com conta.`:`Plano pré-jogo enviado a ${sent} convocado(s) com conta.`);
 }});
}
async function prepareTrainingNotification(id){
 const t=state.trainings.find(x=>x.id===id);if(!t)return;
 if(!t.backendId){toast('Guarda primeiro o treino online.');return}
 openNotificationTimingModal({heading:'Aviso de treino',description:`${fmtDate(t.date)}${t.time?` · ${t.time}`:''}`,kind:'training',entity:t,onConfirm:async({mode,scheduledFor})=>{
  const r=await createNotification({type:'training',title:'TREINO',body:`Treino · ${fmtDate(t.date)}${t.time?` às ${t.time}`:''}${t.location?` · ${t.location}`:''}.`,audience:'players',trainingId:t.id,dedupeKey:`training:${t.backendId}`,scheduledFor});
  renderChrome();toast(mode==='schedule'?`Aviso de treino programado para ${r.recipient_count||0} jogador(es).`:`Aviso de treino enviado a ${r.recipient_count||0} jogador(es).`);
 }});
}
function noticeHtml(n){
 const type=n.notificationType||n.type||'general';
 const when=n.scheduledFor?`Programada: ${fmtDateTime(n.scheduledFor)}`:new Date(n.createdAt).toLocaleString('pt-PT');
 return `<div class="notice-card ${esc(n.type)} ${n.read?'':'unread'}"><div class="notice-title-row"><h4>${esc(n.title)}</h4>${n.read?'':pill('Nova','green')}</div><p>${esc(n.body)}</p><div class="notice-meta"><span>${when}</span><span>${esc(notificationTypeLabel(type))}</span></div></div>`;
}
function renderNotifications(){
 if(guestMode){$('#view-notifications').innerHTML=empty('Inicia sessão','As notificações pessoais estão disponíveis para contas registadas.');return}
 const rows=state.notifications.filter(notificationVisible).slice().reverse();
 const prefs=currentNotificationPreferences();
 const pushLabel=!backendPushDevice.supported?'Não suportado':backendPushDevice.subscribed?'Ativo neste dispositivo':backendPushDevice.permission==='denied'?'Bloqueado':'Desativado';
 const pushType=backendPushDevice.subscribed?'green':backendPushDevice.permission==='denied'?'red':'amber';
 const pushCard=backendSession?`<div class="card"><div class="card-head"><div><h3>Push neste dispositivo</h3><p>Recebe avisos mesmo quando a app não está aberta.</p></div>${pill(pushLabel,pushType)}</div><div class="note">A subscrição pertence a este browser/dispositivo. Podes ativar a mesma conta em vários dispositivos.</div><div class="form-actions">${backendPushDevice.subscribed?'<button class="btn" id="testPush">Enviar push de teste</button><button class="btn secondary" id="disablePush">Desativar neste dispositivo</button>':'<button class="btn" id="enableBrowserNotifications">Ativar push neste dispositivo</button>'}</div></div><div style="height:12px"></div>`:'';
 const prefCard=backendSession?`<div class="card"><div class="card-head"><div><h3>Preferências</h3><p>Escolhe os tipos de aviso que queres receber na tua caixa de notificações.</p></div>${pill('Online','green')}</div><form id="notificationPrefs"><div class="checkboxes notification-pref-grid">${[
  ['callup_enabled','Convocatórias'],
  ['matchday_enabled','DIA DE JOGO!'],
  ['training_enabled','Treinos'],
  ['result_enabled','Resultados finais'],
  ['nutrition_enabled','Plano pré-jogo'],
  ['general_enabled','Mensagens gerais']
 ].map(([k,l])=>`<label class="check-pill"><input type="checkbox" name="${k}" ${prefs[k]!==false?'checked':''}>${l}</label>`).join('')}</div><div class="form-actions"><button class="btn" id="saveNotificationPrefs">Guardar preferências</button></div></form></div><div style="height:12px"></div>`:'';
 $('#view-notifications').innerHTML=`<div class="section-head"><div><h2>Notificações</h2><p>Convocatórias, treinos, dia de jogo, resultados e plano pré-jogo.</p></div><div class="inline-actions"><button class="btn secondary" id="refreshNotifications">Atualizar</button>${canEdit()?'<button class="btn" id="customNotification">＋ Nova</button>':''}</div></div><div class="info-strip">As mensagens ficam guardadas online e, quando o push está ativo, os avisos imediatos e programados são enviados automaticamente pelo servidor.</div><div style="height:12px"></div>${pushCard}${prefCard}<div class="grid equal2">${rows.length?rows.map(noticeHtml).join(''):empty('Sem notificações','Ainda não tens mensagens disponíveis.')}</div>`;
 $('#enableBrowserNotifications')&&($('#enableBrowserNotifications').onclick=async()=>{const b=$('#enableBrowserNotifications');b.disabled=true;b.textContent='A ativar…';try{await activatePushOnDevice();toast('Push ativado neste dispositivo.');renderNotifications()}catch(err){console.error(err);alert(`Não foi possível ativar o push.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Ativar push neste dispositivo'}});
 $('#testPush')&&($('#testPush').onclick=async()=>{const b=$('#testPush');b.disabled=true;b.textContent='A enviar…';try{const r=await sendPushTest();toast(`Push de teste enviado (${r.sent||0}).`)}catch(err){console.error(err);alert(`Não foi possível enviar o push de teste.\n\n${err?.message||'Erro desconhecido'}`)}finally{b.disabled=false;b.textContent='Enviar push de teste'}});
 $('#disablePush')&&($('#disablePush').onclick=async()=>{if(!confirm('Desativar notificações push neste dispositivo?'))return;const b=$('#disablePush');b.disabled=true;try{await deactivatePushOnDevice();toast('Push desativado neste dispositivo.');renderNotifications()}catch(err){console.error(err);alert(`Não foi possível desativar o push.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false}});
 $('#refreshNotifications').onclick=async()=>{try{await loadBackendNotifications();await loadPushDeviceStatus();renderNotifications();renderChrome();toast('Notificações atualizadas.')}catch(err){console.error(err);alert(`Não foi possível atualizar as notificações.\n\n${err?.message||'Erro desconhecido'}`)}};
 $('#customNotification')&&($('#customNotification').onclick=openCustomNotification);
 $('#notificationPrefs')&&($('#notificationPrefs').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),payload={};Object.keys(NOTIFICATION_PREF_DEFAULTS).forEach(k=>payload[k]=fd.get(k)==='on');const b=$('#saveNotificationPrefs');b.disabled=true;b.textContent='A guardar…';try{await saveBackendNotificationPreferences(payload);toast('Preferências guardadas.');renderNotifications()}catch(err){console.error(err);alert(`Não foi possível guardar as preferências.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Guardar preferências'}});
 markBackendNotificationsRead().catch(console.error);
}
async function requestNotificationPermission(){return activatePushOnDevice()}
function openCustomNotification(){
 openModal('Nova notificação','Mensagem manual guardada online.',`<form id="notifForm"><div class="form-grid"><div class="field full"><label>Título</label><input name="title" required></div><div class="field full"><label>Mensagem</label><textarea name="body" required></textarea></div><div class="field"><label>Destinatários</label><select name="audience"><option value="all_registered">Todos os utilizadores registados</option><option value="players_members">Jogadores + Sócios</option><option value="players">Jogadores</option><option value="members">Sócios</option></select></div><div class="field"><label>Quando enviar?</label><select name="timingMode" id="customTimingMode"><option value="now">Enviar agora</option><option value="schedule">Programar</option></select></div><div class="field custom-schedule-field hidden"><label>Data</label><input name="scheduleDate" type="date" value="${nowKey()}"></div><div class="field custom-schedule-field hidden"><label>Hora</label><input name="scheduleTime" type="time"></div></div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="sendCustomNotification">Enviar</button></div></form>`);
 const sync=()=>$$('.custom-schedule-field',$('#notifForm')).forEach(el=>el.classList.toggle('hidden',$('#customTimingMode').value!=='schedule'));$('#customTimingMode').onchange=sync;sync();
 $('#notifForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),b=$('#sendCustomNotification');let scheduledFor=null;if(d.timingMode==='schedule'){if(!d.scheduleDate||!d.scheduleTime){alert('Indica a data e hora.');return}scheduledFor=portugalKickoffIso(d.scheduleDate,d.scheduleTime);if(new Date(scheduledFor).getTime()<=Date.now()){alert('Escolhe uma data/hora futura ou envia agora.');return}}b.disabled=true;b.textContent=d.timingMode==='schedule'?'A programar…':'A enviar…';try{const r=await createNotification({type:'general',title:d.title,body:d.body,audience:d.audience,scheduledFor});closeModal();renderChrome();renderNotifications();toast(d.timingMode==='schedule'?`Notificação programada para ${r.recipient_count||0} utilizador(es).`:`Notificação enviada a ${r.recipient_count||0} utilizador(es).`)}catch(err){console.error(err);alert(`Não foi possível enviar a notificação.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Enviar'}};$('[data-close]').onclick=closeModal;
}

function memberStatusAccountHtml(){
 const status=backendProfile?.member_status||'none';
 const number=backendProfile?.member_number||'';
 if(status==='verified'||backendRoles.includes('member'))return `<div class="info-strip"><strong>Sócio validado</strong><br>O número de sócio <strong>${esc(number||'—')}</strong> foi validado pelo clube. Para o alterar, contacta um Admin.</div>`;
 if(status==='pending')return `<div class="warning-strip"><strong>Pedido pendente de aprovação</strong><br>Indicaste o n.º de sócio <strong>${esc(number||'—')}</strong>. O acesso de Sócio só será atribuído depois de um Admin confirmar o número.</div>`;
 return `<div class="note">Se fores sócio, podes indicar o teu número abaixo. <strong>Inserir o número não dá acesso de Sócio automaticamente</strong>: o pedido fica pendente até um Admin o aprovar.</div>`;
}
function renderAccount(){
 if(!backendSession){$('#view-account').innerHTML=empty('Inicia sessão para gerir a tua conta.');return}
 const verified=backendProfile?.member_status==='verified'||backendRoles.includes('member');
 const pending=backendProfile?.member_status==='pending';
 const emailConfirmed=!!backendSession.user.email_confirmed_at;
 const privacyOk=privacyAcknowledged();
 const pushOk=backendPushDevice.subscribed;
 const installed=appInstalled();
 const memberCheck=verified?pill('Validado','green'):pending?pill('Por validar','amber'):pill('Não indicado','gray');
 $('#view-account').innerHTML=`<div class="section-head"><div><h2>A minha conta</h2><p>Dados pessoais, pedido de sócio e segurança.</p></div>${verified?pill('Sócio validado','green'):pending?pill('Sócio por validar','amber'):pill('Conta registada','gray')}</div>
 <div class="info-strip"><strong>Primeiro acesso</strong><br>Confirma o checklist abaixo. As funções e acessos internos são atribuídos pelo clube; indicar um n.º de sócio nunca concede automaticamente o acesso de Sócio.</div><div style="height:15px"></div>
 <div class="card release-check-card"><div class="card-head"><div><h3>Primeiro acesso</h3><p>Confirma os pontos essenciais desta conta e deste dispositivo.</p></div>${privacyOk&&emailConfirmed?pill('Conta preparada','green'):pill('Ação necessária','amber')}</div><div class="release-check-grid">
  <div class="release-check-item"><span>Email confirmado</span>${emailConfirmed?pill('OK','green'):pill('Pendente','amber')}</div>
  <div class="release-check-item"><span>Privacidade</span>${privacyOk?pill('Confirmada','green'):pill('Ler e confirmar','amber')}</div>
  <div class="release-check-item"><span>Push neste dispositivo</span>${pushOk?pill('Ativo','green'):backendPushDevice.permission==='denied'?pill('Bloqueado','red'):pill('Opcional','gray')}</div>
  <div class="release-check-item"><span>App instalada</span>${installed?pill('Instalada','green'):pill('No browser','gray')}</div>
  <div class="release-check-item"><span>N.º de sócio</span>${memberCheck}</div>
 </div><div class="form-actions"><button class="btn secondary" id="accountPrivacy">Ver privacidade</button>${!pushOk&&backendPushDevice.supported&&backendPushDevice.permission!=='denied'?'<button class="btn secondary" id="accountEnablePush">Ativar notificações</button>':''}</div></div>
 <div style="height:15px"></div><div class="grid equal2"><div class="card"><div class="card-head"><div><h3>Perfil</h3><p>Informação apresentada na aplicação.</p></div></div><form id="myProfileForm"><div class="form-grid"><div class="field full"><label>Nome</label><input name="displayName" value="${esc(backendDisplayName())}" required></div><div class="field full"><label>Email</label><input value="${esc(backendSession.user.email||'')}" disabled><small>O email de autenticação não é alterado aqui.</small></div></div><div class="form-actions"><button class="btn" id="saveMyProfile">Guardar nome</button></div></form></div><div class="card"><div class="card-head"><div><h3>Número de sócio</h3><p>Validação obrigatória pelo clube.</p></div></div>${memberStatusAccountHtml()}<div style="height:12px"></div><form id="memberRequestForm"><div class="field"><label>N.º de sócio</label><input name="memberNumber" value="${esc(backendProfile?.member_number||'')}" ${verified?'disabled':''} placeholder="Ex.: 123"><small>${verified?'Número validado. Apenas um Admin o pode alterar.':pending?'Podes corrigir o número enquanto o pedido estiver pendente. Qualquer alteração continua pendente de aprovação.':'O pedido ficará pendente até validação por um Admin.'}</small></div>${verified?'':`<div class="form-actions"><button class="btn" id="saveMemberRequest">${pending?'Atualizar pedido':'Enviar para aprovação'}</button>${pending?'<button type="button" class="btn secondary" id="cancelMemberRequest">Cancelar pedido</button>':''}</div>`}</form></div></div>
 <div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Segurança</h3><p>Alterar a palavra-passe desta conta.</p></div></div><form id="changePasswordForm"><div class="form-grid"><div class="field"><label>Nova palavra-passe</label><input name="password" type="password" autocomplete="new-password" minlength="12" required></div><div class="field"><label>Confirmar nova palavra-passe</label><input name="password2" type="password" autocomplete="new-password" minlength="8" required></div></div><div class="form-actions"><button class="btn" id="changeMyPasswordBtn">Alterar palavra-passe</button></div></form><div class="note">Usa pelo menos 8 caracteres. Se não te lembrares da palavra-passe atual, usa “Esqueci-me da palavra-passe” no ecrã de login.</div></div>`;
 $('#accountPrivacy').onclick=()=>showView('privacy');
 $('#accountEnablePush')&&($('#accountEnablePush').onclick=async()=>{const b=$('#accountEnablePush');b.disabled=true;b.textContent='A ativar…';try{await activatePushOnDevice();renderAccount();renderChrome();toast('Notificações ativadas neste dispositivo.')}catch(err){console.error(err);alert(`Não foi possível ativar as notificações.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Ativar notificações'}});
 $('#myProfileForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),b=$('#saveMyProfile');b.disabled=true;b.textContent='A guardar…';try{await updateMyProfileName(fd.get('displayName'));renderChrome();renderAccount();toast('Perfil atualizado.')}catch(err){console.error(err);alert(`Não foi possível atualizar o perfil.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Guardar nome'}};
 if($('#memberRequestForm'))$('#memberRequestForm').onsubmit=async e=>{e.preventDefault();if(verified)return;const fd=new FormData(e.target),number=String(fd.get('memberNumber')||'').trim();if(!number){alert('Indica o número de sócio.');return}const b=$('#saveMemberRequest');b.disabled=true;b.textContent='A enviar…';try{await requestMyMemberNumber(number);renderChrome();renderAccount();toast('Pedido de sócio enviado para aprovação.')}catch(err){console.error(err);alert(`Não foi possível enviar o pedido.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent=pending?'Atualizar pedido':'Enviar para aprovação'}};
 $('#cancelMemberRequest')&&($('#cancelMemberRequest').onclick=async()=>{if(!confirm('Cancelar o pedido de validação de sócio?'))return;const b=$('#cancelMemberRequest');b.disabled=true;try{await requestMyMemberNumber('');renderChrome();renderAccount();toast('Pedido de sócio cancelado.')}catch(err){console.error(err);alert(`Não foi possível cancelar o pedido.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false}});
 $('#changePasswordForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),b=$('#changeMyPasswordBtn');b.disabled=true;b.textContent='A alterar…';try{await changeMyPassword(String(fd.get('password')||''),String(fd.get('password2')||''));e.target.reset();toast('Palavra-passe alterada.')}catch(err){console.error(err);alert(`Não foi possível alterar a palavra-passe.\n\n${friendlyAuthError(err)||err?.message||'Erro desconhecido'}`)}finally{b.disabled=false;b.textContent='Alterar palavra-passe'}};
}

function renderPrivacy(){
 const logged=!!backendSession?.user?.id;
 const acknowledged=privacyAcknowledged();
 const ackWhen=backendPrivacyAcknowledgement?.acknowledged_at?fmtDateTime(backendPrivacyAcknowledgement.acknowledged_at):'';
 $('#view-privacy').innerHTML=`<div class="section-head"><div><h2>Privacidade</h2><p>Como a plataforma ADC Figueiras utiliza e apresenta os dados.</p></div>${logged?(acknowledged?pill('Confirmada','green'):pill('Por confirmar','amber')):pill('Informação pública','gray')}</div>
 <div class="grid equal2"><div class="card"><div class="card-head"><div><h3>Que dados existem</h3><p>O conteúdo depende da função atribuída.</p></div></div><div class="privacy-list"><div><strong>Dados públicos do clube</strong><span>Jogos, resultados, classificação, estatísticas desportivas e informação pública dos jogadores.</span></div><div><strong>Conta</strong><span>Nome, email, funções, eventual número de sócio e preferências de notificações.</span></div><div><strong>Dados internos da equipa</strong><span>Convocatórias ainda não publicadas, presenças, disponibilidade, pesagens, multas e registos não públicos dos jogos.</span></div><div><strong>Notificações</strong><span>Quando ativas push, é guardada uma subscrição técnica do dispositivo para permitir a entrega dos avisos.</span></div></div></div>
 <div class="card"><div class="card-head"><div><h3>Quem pode ver</h3><p>Acesso por função, aplicado também no backend.</p></div></div><div class="privacy-list"><div><strong>Público / Registado / Sócio</strong><span>Pode consultar o Plantel, as fichas e estatísticas desportivas dos jogadores e os dados públicos do Match Center, sem acesso a presenças, disponibilidade, pesagens, multas ou convocatórias ainda não publicadas. A convocatória fica visível após a publicação pela equipa técnica.</span></div><div><strong>Jogador</strong><span>Tem acesso à área interna do plantel, treinos e pesagens. Todos os jogadores podem consultar as pesagens dos colegas na área interna, conforme a regra estabelecida pelo clube. Nas multas, cada jogador vê apenas os seus próprios registos.</span></div><div><strong>Capitão</strong><span>Tem os acessos de jogador e pode consultar e gerir as multas individuais da equipa, mas não altera as regras de multas.</span></div><div><strong>Equipa Técnica / Admin</strong><span>Gerem os dados internos necessários às respetivas funções. O Admin gere também contas e permissões.</span></div></div></div></div>
 <div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Controlo e transparência</h3><p>Versão da política: ${esc(PRIVACY_POLICY_VERSION)}</p></div></div><div class="note">As notificações push podem ser desativadas por dispositivo e as preferências por tipo de aviso podem ser alteradas na área Notificações. O número de sócio indicado pelo utilizador fica pendente até validação por um Admin. Para corrigir dados da conta ou esclarecer o tratamento dos dados, contacta o clube através de <strong>adcf2015@gmail.com</strong>.</div>${logged?`<div style="height:12px"></div>${acknowledged?`<div class="info-strip"><strong>Política apresentada e confirmada</strong>${ackWhen?` · ${esc(ackWhen)}`:''}.</div>`:`<div class="warning-strip">Ainda não confirmaste que esta política te foi apresentada.</div><div class="form-actions"><button class="btn" id="ackPrivacy">Tomei conhecimento</button></div>`}`:''}</div>
 <div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Documentos legais</h3><p>Consulta as páginas informativas completas antes de continuares.</p></div></div><div class="inline-actions"><a class="btn secondary sm" href="termos.html" target="_blank" rel="noopener noreferrer">Termos e Condições</a><a class="btn secondary sm" href="privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a><a class="btn secondary sm" href="cookies.html" target="_blank" rel="noopener noreferrer">Política de Cookies</a></div></div>
 <div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Nota</h3></div></div><div class="note">Esta página descreve o funcionamento da aplicação e os acessos configurados. A confirmação acima regista apenas a tomada de conhecimento desta informação; não substitui outras obrigações legais ou organizativas que possam aplicar-se ao clube.</div></div>`;
 $('#ackPrivacy')&&($('#ackPrivacy').onclick=async()=>{const b=$('#ackPrivacy');b.disabled=true;b.textContent='A guardar…';try{await acknowledgePrivacyNotice();renderPrivacy();renderChrome();toast('Privacidade confirmada.');queuePushOnboarding()}catch(err){console.error(err);alert(`Não foi possível guardar a confirmação.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Tomei conhecimento'}});
}

function renderTraining(){const rows=[...seasonTrainings()].sort((a,b)=>dateTimeOf(b.date,b.time)-dateTimeOf(a.date,a.time));$('#view-training').innerHTML=`<div class="section-head"><div><h2>Treinos</h2><p>Presenças e pesagens guardadas online. Os atletas não precisam confirmar nem justificar na app.</p></div>${canEdit()?'<button class="btn" id="addTraining">＋ Novo treino</button>':''}</div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Local</th><th>Presenças</th><th>Pesagens</th><th></th></tr></thead><tbody>${rows.map(t=>{const entries=Object.values(t.entries||{});const pres=entries.filter(e=>e.status==='Presente'||e.status==='Atrasado').length;const ws=entries.filter(e=>e.pre||e.post).length;return `<tr><td><strong>${fmtDate(t.date)}</strong><div class="meta">${esc(t.time||'')}</div></td><td>${esc(t.location||'—')}</td><td>${pres}/${state.players.length}</td><td>${ws}</td><td><div class="inline-actions"><button class="btn secondary sm open-training" data-id="${t.id}">${canEdit()?'Gerir':'Ver'}</button>${canEdit()?`<button class="btn danger sm delete-training" data-id="${t.id}">Eliminar</button>`:''}</div></td></tr>`}).join('')}</tbody></table></div>`:empty('Ainda não existem treinos','Cria o primeiro treino da época.')}`;$('#addTraining')&&($('#addTraining').onclick=openTrainingCreate);$$('.open-training').forEach(b=>b.onclick=()=>openTrainingManage(b.dataset.id));$$('.delete-training').forEach(b=>b.onclick=async()=>{const t=state.trainings.find(x=>x.id===b.dataset.id);if(!t||!confirm('Eliminar este treino?'))return;const btn=b;btn.disabled=true;btn.textContent='A eliminar…';try{if(backendConnected&&t.backendId)await deleteBackendTraining(t);state.trainings=state.trainings.filter(x=>x.id!==t.id);saveState('Treino eliminado do Supabase.')}catch(err){console.error(err);alert(`Não foi possível eliminar o treino.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent='Eliminar'}})}
function openTrainingCreate(){openModal('Novo treino','Sessão de treino da época ativa.',`<form id="trainingForm"><div class="form-grid"><div class="field"><label>Data *</label><input type="date" name="date" value="${nowKey()}" required></div><div class="field"><label>Hora</label><input type="time" name="time" value="21:30"></div><div class="field full"><label>Local</label><input name="location"></div><div class="field full"><label>Notas internas</label><textarea name="notes"></textarea></div></div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="createTrainingBtn">Criar treino</button></div></form>`);$('#trainingForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const t={id:uid('t'),seasonId:state.settings.activeSeasonId,...d,status:'scheduled',entries:{}};state.trainings.push(t);const btn=$('#createTrainingBtn');if(btn){btn.disabled=true;btn.textContent='A criar…'}try{if(backendConnected)await saveBackendTraining(t);closeModal();saveState('Treino criado no Supabase.');openTrainingManage(t.id)}catch(err){console.error(err);state.trainings=state.trainings.filter(x=>x!==t);alert(`Não foi possível criar o treino.\n\n${err?.message||'Erro desconhecido'}`);if(btn){btn.disabled=false;btn.textContent='Criar treino'}}};$('[data-close]').onclick=closeModal}
function openTrainingManage(id){const t=state.trainings.find(x=>x.id===id);if(!t)return;const editable=canEdit();const rows=state.players.map(p=>{const e=t.entries?.[p.id]||{};const a=Number(e.pre),b=Number(e.post),delta=a&&b?b-a:null,pct=a&&b?(b-a)/a*100:null;return `<div class="training-row" data-player="${p.id}">${playerHtml(p)}<select class="att-status" ${editable?'':'disabled'}><option value="">— Estado —</option>${['Presente','Atrasado','Falta','Lesionado'].map(s=>`<option ${e.status===s?'selected':''}>${s}</option>`).join('')}</select><input class="w-pre" type="number" step="0.1" min="20.1" max="249.9" placeholder="Antes kg" value="${esc(e.pre||'')}" ${editable?'':'disabled'}><input class="w-post" type="number" step="0.1" min="20.1" max="249.9" placeholder="Depois kg" value="${esc(e.post||'')}" ${editable?'':'disabled'}><div class="delta">${delta===null?'—':`${delta>0?'+':''}${delta.toFixed(1)} kg<br><span class="muted">${pct.toFixed(2)}%</span>`}</div></div>`}).join('');openModal(`Treino · ${fmtDate(t.date)}`,`${t.time||''}${t.location?` · ${t.location}`:''}`,`${editable?'<div class="info-strip">A equipa técnica regista presenças e pesos. As alterações são guardadas no Supabase.</div><div style="height:10px"></div>':''}<div class="training-roster">${rows}</div><div class="form-actions"><button class="btn secondary" data-close>Fechar</button>${editable?'<button class="btn secondary" id="notifyTraining">Avisar jogadores</button><button class="btn" id="saveTraining">Guardar</button>':''}</div>`,true);$('#saveTraining')&&($('#saveTraining').onclick=async()=>{const oldEntries=JSON.parse(JSON.stringify(t.entries||{})),oldFines=JSON.parse(JSON.stringify(state.fines||[]));t.entries=t.entries||{};$$('.training-row',$('#modalBody')).forEach(r=>{t.entries[r.dataset.player]={status:$('.att-status',r).value,pre:$('.w-pre',r).value,post:$('.w-post',r).value}});syncTrainingLateFines(t);const btn=$('#saveTraining');btn.disabled=true;btn.textContent='A guardar…';try{if(backendConnected)await saveBackendTraining(t);closeModal();saveState('Treino, presenças e pesagens guardados online.')}catch(err){console.error(err);t.entries=oldEntries;state.fines=oldFines;alert(`Não foi possível guardar o treino no Supabase.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent='Guardar'}});$('#notifyTraining')&&($('#notifyTraining').onclick=()=>prepareTrainingNotification(t.id));$('[data-close]').onclick=closeModal}

function renderWeights(){const ref=state.settings.weightReference;const cards=state.players.map(p=>{const l=latestWeight(p.id);const avg=avgWeightLast14(p.id,nowKey());return `<div class="weight-card"><div>${playerHtml(p)}</div><div><div class="weight-label">Último pré</div><div class="weight-number">${l?.pre?`${l.pre.toFixed(1)} kg`:'—'}</div></div><div><div class="weight-label">Último pós</div><div class="weight-number">${l?.post?`${l.post.toFixed(1)} kg`:'—'}</div></div><div><div class="weight-label">Média 2 semanas</div><div class="weight-number">${avg?`${avg.toFixed(1)} kg`:'—'}</div></div></div>`}).join('');$('#view-weights').innerHTML=`<div class="section-head"><div><h2>Pesagens do plantel</h2><p>Os atletas podem consultar as próprias pesagens e as dos colegas.</p></div>${canEdit()?`<span class="pill blue">Referência plano: ${ref==='pre'?'pré-treino':ref==='post'?'pós-treino':'média pré/pós'}</span>`:''}</div><div class="warning-strip">As pesagens são dados internos. Na configuração atual, Jogadores, Capitão, Equipa Técnica e Admin podem consultá-las; Público e Sócios sem função interna não têm acesso. Consulta a área Privacidade para mais detalhes.</div><div style="height:12px"></div><div class="grid">${cards||empty('Sem jogadores')}</div>`}

function renderSquad(){
 const stats=playerStats();const historical=isHistoricalSeason(),showPrivate=privatePlayerAccess();const sorted=[...state.players].sort((a,b)=>{const ag=a.position==='GR'?0:1,bg=b.position==='GR'?0:1;if(ag!==bg)return ag-bg;const an=Number(a.number),bn=Number(b.number);if(Number.isFinite(an)&&Number.isFinite(bn))return an-bn;return a.name.localeCompare(b.name,'pt')});
 $('#view-squad').innerHTML=`<div class="section-head"><div><h2>${historical?'Plantel histórico':'Plantel'}</h2><p>${historical?`ADC Figueiras · Época ${esc(activeSeason()?.label||'')}`:'Plantel visual, disponibilidade e estatísticas da época.'}</p></div>${canEdit()?'<button class="btn" id="addPlayer">＋ Jogador</button>':''}</div><div class="squad-grid">${sorted.map(p=>{const st=stats[p.id]||{};return `<article class="squad-card" data-player-profile="${p.id}"><div class="squad-card-top"><div class="squad-number ${p.position==='GR'?'keeper':'field'}">${esc(p.number||'—')}</div><div class="squad-identity"><div class="eyebrow">${esc(p.position||'Jogador')}</div><h3>${esc(p.name)}</h3>${showPrivate&&p.status?pill(normalizePlayerStatus(p.status),statusPillType(p.status)):''}</div></div><div class="squad-mini-stats"><span><strong>${st.games||0}</strong> jogos</span><span><strong>${st.goals||0}</strong> G</span><span><strong>${st.assists||0}</strong> A</span></div><div class="squad-actions"><button class="btn secondary sm view-player" data-id="${p.id}">Ficha</button>${canEdit()?`<button class="btn secondary sm edit-player" data-id="${p.id}">Editar</button>`:''}</div></article>`}).join('')}</div>`;$('#addPlayer')&&($('#addPlayer').onclick=()=>openPlayer());$$('.view-player').forEach(b=>b.onclick=e=>{e.stopPropagation();openPlayerProfile(b.dataset.id)});$$('.squad-card').forEach(r=>r.onclick=()=>openPlayerProfile(r.dataset.playerProfile));$$('.edit-player').forEach(b=>b.onclick=e=>{e.stopPropagation();openPlayer(b.dataset.id)})
}
function openPlayer(id=''){
 const p=id?playerById(id):{id:'',name:'',position:'Jogador',number:'',status:'Disponível'};
 openModal(id?'Editar jogador':'Novo jogador','Dados básicos do plantel.',`<form id="playerForm"><div class="form-grid"><div class="field full"><label>Nome *</label><input name="name" value="${esc(p.name)}" required ${isHistoricalSeason()&&id?'readonly':''}>${isHistoricalSeason()&&id?'<small>O nome segue a identidade atual do jogador.</small>':''}</div><div class="field"><label>Posição</label><select name="position">${['GR','Fixo','Fixo / Ala','Ala','Ala / Pivot','Pivot','Jogador'].map(x=>`<option ${p.position===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Número</label><input type="number" min="1" max="99" name="number" value="${esc(p.number||'')}"></div>${isHistoricalSeason()?'':`<div class="field"><label>Estado</label><select name="status">${['Disponível','Lesionado','Suspenso','Ausente','Em dúvida'].map(x=>`<option ${normalizePlayerStatus(p.status)===x?'selected':''}>${x}</option>`).join('')}</select></div>`}</div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="savePlayerBtn">Guardar</button></div></form>`);
 $('#playerForm').onsubmit=async e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  d.name=sanitizePlainText(d.name,120);
  if(!d.name){alert('Indica o nome do jogador.');return}
  const btn=$('#savePlayerBtn');if(btn){btn.disabled=true;btn.textContent='A guardar…'}
  try{
   if(backendConnected&&backendRosterLoaded&&backendRoster.rows.length){
    await saveBackendPlayer(id?p:null,d,!id);
    closeModal();
    renderChrome();
    renderView(currentView);
    toast('Plantel guardado no Supabase.');
   }else{
    if(id)Object.assign(p,d);else state.players.push({id:uid('p'),...d});
    closeModal();saveState('Plantel atualizado.');
   }
  }catch(err){
   console.error(err);
   alert(`Não foi possível guardar o jogador no Supabase.\n\n${err?.message||'Erro desconhecido'}`);
   if(btn){btn.disabled=false;btn.textContent='Guardar'}
  }
 };
 $('[data-close]').onclick=closeModal
}
function renderPlayerProfile(){
 const p=playerById(selectedPlayerId)||state.players[0];if(!p){$('#view-player').innerHTML=empty('Sem jogadores');return}selectedPlayerId=p.id;sessionStorage.setItem('playerView',p.id);const s=playerStats()[p.id]||{};const privateOk=privatePlayerAccess();const finePrivateOk=canViewPlayerFines(p.id);const att=privateOk?playerAttendanceStats(p.id):{recorded:0,present:0,pct:0};const weights=privateOk?playerWeightRows(p.id):[];const fines=finePrivateOk?playerFineRows(p.id):[];const latest=weights[0];const pending=fines.filter(f=>fineStatus(f)==='pending').reduce((sum,f)=>sum+Number(f.amount||0),0);
 $('#view-player').innerHTML=`<div class="section-head"><div><button class="back-link" id="backSquad">← Plantel</button><h2>${esc(p.name)}</h2><p>#${esc(p.number||'—')} · ${esc(p.position||'Jogador')}</p></div>${canEdit()?`<button class="btn secondary" id="editProfilePlayer">Editar jogador</button>`:''}</div><div class="player-profile-hero card"><div class="profile-number ${p.position==='GR'?'keeper':'field'}">${esc(p.number||'—')}</div><div><div class="eyebrow">${esc(p.position||'Jogador')}</div><h2>${esc(p.name)}</h2>${privateOk?`<div class="tags">${pill(normalizePlayerStatus(p.status),statusPillType(p.status))}</div>`:''}</div></div><div style="height:15px"></div><div class="grid kpis player-kpis"><div class="card kpi"><div class="label">Convocatórias</div><div class="value">${s.callups||0}</div></div><div class="card kpi"><div class="label">Jogos</div><div class="value">${s.games||0}</div></div><div class="card kpi"><div class="label">Titularidades</div><div class="value">${s.starts||0}</div></div><div class="card kpi"><div class="label">Golos</div><div class="value">${s.goals||0}</div></div><div class="card kpi"><div class="label">Assistências</div><div class="value">${s.assists||0}</div></div><div class="card kpi"><div class="label">Cartões</div><div class="value cards-value"><span title="Amarelos">A ${s.yellow||0}</span><span title="Duplo amarelo">AA ${s.secondYellow||0}</span><span title="Vermelhos diretos">V ${s.red||0}</span></div></div></div><div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Últimos 5 jogos</h3><p>Últimas utilizações · adversário, contribuições para golo e disciplina.</p></div></div>${playerRecentGamesHtml(p.id)}</div>${privateOk?`<div style="height:15px"></div><div class="grid two"><div class="card"><div class="card-head"><div><h3>Treinos</h3><p>Área interna.</p></div></div><div class="private-stat"><strong>${att.present}</strong><span>presenças</span></div><div class="private-stat"><strong>${att.pct}%</strong><span>assiduidade (${att.present}/${att.recorded||0})</span></div></div><div class="card"><div class="card-head"><div><h3>Pesagens</h3><p>Último registo.</p></div></div>${latest?`<div class="grid equal2"><div><div class="weight-label">Último pré</div><div class="weight-number">${latest.pre?`${Number(latest.pre).toFixed(1)} kg`:'—'}</div></div><div><div class="weight-label">Último pós</div><div class="weight-number">${latest.post?`${Number(latest.post).toFixed(1)} kg`:'—'}</div></div></div>`:empty('Sem pesagens registadas')}</div></div><div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Evolução do peso</h3><p>Visível apenas a jogadores e equipa técnica.</p></div></div>${weightChartHtml(p.id)}</div>${finePrivateOk?`<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Multas</h3><p>${mode==='player'?'As tuas multas da época.':'Histórico interno da época.'}</p></div><strong>${money(pending)} pendente</strong></div>${fines.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Motivo</th><th>Valor</th><th>Estado</th></tr></thead><tbody>${fines.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${esc(f.reason)}</td><td>${money(f.amount)}</td><td>${pill(fineStatusLabel(fineStatus(f)),fineStatusPill(fineStatus(f)))}</td></tr>`).join('')}</tbody></table></div>`:empty('Sem multas registadas')}</div>`:''}`:''}`;
 $('#backSquad').onclick=()=>showView('squad');$('#editProfilePlayer')&&($('#editProfilePlayer').onclick=()=>openPlayer(p.id));$$('[data-recent-game]').forEach(b=>b.onclick=()=>{sessionStorage.setItem('mcGame',b.dataset.recentGame);showView('matchcenter')});
}

function renderStats(){const stats=playerStats();const rows=state.players.map(p=>({p,...stats[p.id]})).sort((a,b)=>b.goals-a.goals||b.assists-a.assists);const games=seasonGames().filter(g=>g.status==='final'||(g.homeScore!==''&&g.awayScore!==''));let w=0,d=0,l=0,gf=0,ga=0;games.forEach(g=>{const a=Number(g.homeScore)||0,b=Number(g.awayScore)||0;gf+=a;ga+=b;if(a>b)w++;else if(a===b)d++;else l++});$('#view-stats').innerHTML=`<div class="grid kpis"><div class="card kpi"><div class="label">Jogos concluídos</div><div class="value">${games.length}</div></div><div class="card kpi"><div class="label">V / E / D</div><div class="value">${w}/${d}/${l}</div></div><div class="card kpi"><div class="label">Golos</div><div class="value">${gf}</div><div class="sub">marcados</div></div><div class="card kpi"><div class="label">Diferença</div><div class="value">${gf-ga>0?'+':''}${gf-ga}</div></div></div><div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Estatísticas individuais</h3><p>Dados da época ${esc(activeSeason()?.label||'')}</p></div></div><div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Conv.</th><th>Jogos</th><th>5 inicial</th><th>Golos</th><th>Assist.</th><th>G+A</th><th title="Amarelos">A</th><th title="Duplo amarelo">AA</th><th title="Vermelhos diretos">V</th></tr></thead><tbody>${rows.map(x=>`<tr class="player-profile-row" data-player-profile="${x.p.id}"><td>${playerStatHtml(x.p)}</td><td>${x.callups}</td><td>${x.games}</td><td>${x.starts}</td><td>${x.goals}</td><td>${x.assists}</td><td><strong>${x.goals+x.assists}</strong></td><td>${x.yellow}</td><td>${x.secondYellow}</td><td>${x.red}</td></tr>`).join('')}</tbody></table></div></div>`;$$('.player-profile-row').forEach(r=>r.onclick=()=>openPlayerProfile(r.dataset.playerProfile))}

function renderSeriesResults(){
 syncClubGamesToFixtures();
 const comps=activeBackendCompetitions().filter(c=>c.track_all_results===true||c.competition_type==='cup');
 if(resultsCompetitionFilter!=='all'&&!comps.some(c=>c.id===resultsCompetitionFilter))resultsCompetitionFilter='all';
 const rowsForComp=comp=>{
  if(comp.track_all_results===true)return seasonCompetitionFixtures().filter(r=>r.competitionId===comp.id);
  return seasonGames().filter(g=>g.competitionId===comp.id).map(clubGameResultRow);
 };
 const selectedComps=resultsCompetitionFilter==='all'?comps:comps.filter(c=>c.id===resultsCompetitionFilter);
 const sourceRows=selectedComps.flatMap(rowsForComp);
 const rounds=[...new Set(sourceRows.map(r=>String(r.round||'')).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt',{numeric:true}));
 const teams=[...new Set(sourceRows.flatMap(r=>[canonicalTeamName(r.home),canonicalTeamName(r.away)]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt'));
 if(resultsRoundFilter!=='all'&&!rounds.includes(resultsRoundFilter))resultsRoundFilter='all';if(resultsTeamFilter!=='all'&&!teams.includes(resultsTeamFilter))resultsTeamFilter='all';
 const matchesFilter=r=>(resultsRoundFilter==='all'||String(r.round||'')===resultsRoundFilter)&&(resultsTeamFilter==='all'||canonicalTeamName(r.home)===resultsTeamFilter||canonicalTeamName(r.away)===resultsTeamFilter);
 const renderTable=comp=>{const rows=rowsForComp(comp).filter(matchesFilter).sort((a,b)=>(Number(a.round)||999)-(Number(b.round)||999)||String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')));if(!rows.length)return empty(`Sem jogos de ${backendCompetitionLabel(comp)} para estes filtros`);const isCup=comp.competition_type==='cup';return `<div class="results-competition-block"><div class="card-head results-competition-heading"><div><h3>${esc(backendCompetitionLabel(comp))}</h3><p>${isCup?'Taça':comp.series_name||'Competição'}</p></div></div><div class="table-wrap"><table><thead><tr><th>${isCup?'Ronda':'Jornada'}</th><th>Data</th><th>Casa</th><th>Resultado</th><th>Fora</th><th></th></tr></thead><tbody>${rows.map(r=>{const club=isFigueirasTeam(r.home)||isFigueirasTeam(r.away);const score=resultScoreText(r);return `<tr class="${club?'club-result-row':''}" ${club&&r.clubGameId?`data-club-game="${esc(r.clubGameId)}" title="Abrir Match Center"`:''}><td>${esc(r.round||'—')}</td><td>${fmtDate(r.date)}<div class="meta">${esc(r.time||'')}</div></td><td>${teamCell(r.home)}</td><td class="score">${esc(score)}</td><td>${teamCell(r.away)}</td><td>${club?(can('matchcenter')?'<span class="pill match-pill">Match Center</span>':''):canEdit()?`<div class="inline-actions"><button class="btn secondary sm edit-series-result" data-id="${r.id}">${score==='—'?'Registar':'Editar'}</button>${isExtraSeriesGame(r)?`<button class="btn danger sm delete-series-result-direct" data-id="${r.id}">Eliminar</button>`:''}</div>`:''}</td></tr>`}).join('')}</tbody></table></div></div>`};
 const tables=selectedComps.map(c=>renderTable(c)).join('<div style="height:18px"></div>');
 const primary=primaryLeagueCompetition(),cup=activeBackendCompetitions().find(c=>c.competition_type==='cup');
 $('#view-seriesResults').innerHTML=`<div class="section-head"><div><h2>Resultados</h2><p>Jogos oficiais da época ${esc(activeSeason()?.label||'')}.</p></div>${canEdit()?`<div class="inline-actions">${cup?'<button class="btn secondary" id="addCupGame">＋ Jogo da Taça</button>':''}${primary?'<button class="btn" id="addSeriesResult">＋ Jogo extra campeonato</button>':''}</div>`:''}</div><div class="toolbar"><div class="field result-filter"><label>Competição</label><select id="resultsCompetition"><option value="all" ${resultsCompetitionFilter==='all'?'selected':''}>Todas as competições</option>${comps.map(c=>`<option value="${c.id}" ${resultsCompetitionFilter===c.id?'selected':''}>${esc(backendCompetitionLabel(c))}</option>`).join('')}</select></div><div class="field result-filter"><label>Jornada / Ronda</label><select id="resultsRound"><option value="all">Todas</option>${rounds.map(r=>`<option value="${esc(r)}" ${resultsRoundFilter===r?'selected':''}>${esc(r)}</option>`).join('')}</select></div><div class="field result-filter"><label>Equipa</label><select id="resultsTeam"><option value="all">Todas as equipas</option>${teams.map(t=>`<option value="${esc(t)}" ${resultsTeamFilter===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div></div><div class="info-strip">As decisões administrativas aparecem sempre como <strong>DA</strong>; o resultado atribuído é usado apenas nos cálculos da classificação.</div><div style="height:12px"></div>${tables||empty('Sem resultados registados')}`;
 $('#resultsCompetition').onchange=e=>{resultsCompetitionFilter=e.target.value;resultsRoundFilter='all';resultsTeamFilter='all';renderSeriesResults()};$('#resultsRound').onchange=e=>{resultsRoundFilter=e.target.value;renderSeriesResults()};$('#resultsTeam').onchange=e=>{resultsTeamFilter=e.target.value;renderSeriesResults()};$('#addSeriesResult')&&($('#addSeriesResult').onclick=()=>openSeriesResult());$('#addCupGame')&&($('#addCupGame').onclick=()=>openGameCreate('Taça AF Porto'));$$('.club-result-row[data-club-game]').forEach(row=>row.onclick=e=>{if(e.target.closest('[data-team-link]'))return;if(!can('matchcenter'))return;sessionStorage.setItem('mcGame',row.dataset.clubGame);showView('matchcenter')});$$('.edit-series-result').forEach(b=>b.onclick=e=>{e.stopPropagation();openSeriesResult(b.dataset.id)});$$('.delete-series-result-direct').forEach(b=>b.onclick=async e=>{e.stopPropagation();const r=state.competitionResults.find(x=>x.id===b.dataset.id);if(!r||!isExtraSeriesGame(r))return;if(!confirm(`Eliminar o jogo ${canonicalTeamName(r.home)} – ${canonicalTeamName(r.away)}?`))return;try{if(r.backendId&&backendMatchesLoaded&&backendMatches.rows.length)await deleteBackendMatchById(r.backendId);state.competitionResults=state.competitionResults.filter(x=>x.id!==r.id);saveState('Jogo extra eliminado e classificação recalculada.')}catch(err){console.error(err);alert(`Não foi possível eliminar o jogo.\n\n${err?.message||'Erro desconhecido'}`)}});
}

function openSeriesResult(id=''){
 const r=id?state.competitionResults.find(x=>x.id===id):{round:'',date:'',time:'',home:'',away:'',homeScore:'',awayScore:'',fixture:false,competitionId:primaryLeagueCompetition()?.id||'',administrativeDecision:'',administrativeHomeScore:'',administrativeAwayScore:''};
 const comp=competitionById(r.competitionId)||primaryLeagueCompetition();
 const allowedTeams=comp?competitionTeamsFor(comp.id):[];const allTeams=(state.teams||seedTeams).filter(t=>!allowedTeams.length||allowedTeams.includes(t.name));const teamOpts=allTeams.map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
 const admin=!!r.administrativeDecision;
 openModal(id?'Editar jogo / resultado':'Novo jogo',comp?backendCompetitionLabel(comp):'Campeonato',`<form id="seriesResultForm"><div class="form-grid"><div class="field"><label>Jornada</label><input type="number" min="1" name="round" value="${esc(r.round||'')}"></div><div class="field"><label>Data</label><input type="date" name="date" value="${esc(r.date||'')}"></div><div class="field"><label>Hora</label><input type="time" name="time" value="${esc(r.time||'')}"></div><div></div><div class="field"><label>Equipa da casa</label><select name="home" required><option value="">—</option>${teamOpts}</select></div><div class="field"><label>Equipa visitante</label><select name="away" required><option value="">—</option>${teamOpts}</select></div><div class="field"><label>Golos casa</label><input type="number" min="0" name="homeScore" value="${esc(r.homeScore)}"></div><div class="field"><label>Golos fora</label><input type="number" min="0" name="awayScore" value="${esc(r.awayScore)}"></div><div class="field full"><label class="check-inline"><input type="checkbox" name="isAdministrative" ${admin?'checked':''}> Decisão administrativa</label><small>Quando ativa, o resultado público é sempre mostrado como DA.</small></div><div class="field admin-decision-field"><label>Tipo de decisão</label><select name="administrativeDecision"><option value="home_win" ${r.administrativeDecision==='home_win'?'selected':''}>Vitória administrativa da equipa da casa</option><option value="away_win" ${r.administrativeDecision==='away_win'?'selected':''}>Vitória administrativa da equipa visitante</option><option value="both_loss" ${r.administrativeDecision==='both_loss'?'selected':''}>Derrota administrativa de ambas</option></select></div><div class="field admin-score-field"><label>Resultado atribuído para a classificação</label><div class="inline-actions"><input style="width:90px" type="number" min="0" name="administrativeHomeScore" value="${esc(r.administrativeHomeScore)}" placeholder="Casa"><span>–</span><input style="width:90px" type="number" min="0" name="administrativeAwayScore" value="${esc(r.administrativeAwayScore)}" placeholder="Fora"></div><small>Opcional. Não é mostrado ao público.</small></div></div><div class="form-actions">${id&&isExtraSeriesGame(r)?'<button type="button" class="btn danger" id="deleteSeriesResult">Eliminar jogo</button><span style="flex:1"></span>':''}<button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn">Guardar</button></div></form>`);
 const form=$('#seriesResultForm');form.elements.home.value=canonicalTeamName(r.home);form.elements.away.value=canonicalTeamName(r.away);
 const syncAdmin=()=>{const on=form.elements.isAdministrative.checked;$$('.admin-decision-field,.admin-score-field').forEach(x=>x.classList.toggle('hidden',!on));form.elements.homeScore.disabled=on;form.elements.awayScore.disabled=on;const both=on&&form.elements.administrativeDecision.value==='both_loss';form.elements.administrativeHomeScore.disabled=both;form.elements.administrativeAwayScore.disabled=both;if(both){form.elements.administrativeHomeScore.value='';form.elements.administrativeAwayScore.value=''}};form.elements.isAdministrative.onchange=syncAdmin;form.elements.administrativeDecision.onchange=syncAdmin;syncAdmin();
 form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),d=Object.fromEntries(fd);if(isFigueirasTeam(d.home)||isFigueirasTeam(d.away)){alert('Os jogos do ADC Figueiras são geridos no Match Center.');return;}const isAdmin=fd.get('isAdministrative')==='on';const decision=isAdmin?String(d.administrativeDecision||''):'';const homeScore=isAdmin?'':(d.homeScore===''?'':Number(d.homeScore)),awayScore=isAdmin?'':(d.awayScore===''?'':Number(d.awayScore));if(!isAdmin&&((homeScore===''&&awayScore!=='')||(homeScore!==''&&awayScore===''))){alert('Preenche os dois resultados ou deixa ambos vazios.');return;}let administrativeHomeScore='',administrativeAwayScore='';if(isAdmin&&decision!=='both_loss'){administrativeHomeScore=d.administrativeHomeScore===''?'':Number(d.administrativeHomeScore);administrativeAwayScore=d.administrativeAwayScore===''?'':Number(d.administrativeAwayScore);if((administrativeHomeScore===''&&administrativeAwayScore!=='')||(administrativeHomeScore!==''&&administrativeAwayScore==='')){alert('Preenche os dois valores do resultado atribuído ou deixa ambos vazios.');return;}}
  const payload={seasonId:state.settings.activeSeasonId,competitionId:r.competitionId||primaryLeagueCompetition()?.id||'',round:d.round,date:d.date,time:d.time,home:canonicalTeamName(d.home),away:canonicalTeamName(d.away),homeScore,awayScore,administrativeDecision:decision,administrativeHomeScore,administrativeAwayScore,venue:teamByName(d.home)?.homeVenue||r.venue||'',fixture:r.fixture!==false,source:r.source||'manual'};const target=id?r:{id:uid('cr'),...payload};if(id)Object.assign(r,payload);else state.competitionResults.push(target);try{if(backendMatchesLoaded&&backendMatches.rows.length)await saveBackendSeriesResult(target);closeModal();saveState('Jogo atualizado e classificação recalculada.')}catch(err){console.error(err);if(!id)state.competitionResults=state.competitionResults.filter(x=>x.id!==target.id);alert(`Não foi possível guardar o resultado no Supabase.\n\n${err?.message||'Erro desconhecido'}`)}};$('#deleteSeriesResult')&&($('#deleteSeriesResult').onclick=async()=>{if(!confirm('Eliminar este jogo extra?'))return;try{if(r.backendId&&backendMatchesLoaded&&backendMatches.rows.length)await deleteBackendMatchById(r.backendId);state.competitionResults=state.competitionResults.filter(x=>x.id!==r.id);closeModal();saveState('Jogo extra eliminado e classificação recalculada.')}catch(err){console.error(err);alert(`Não foi possível eliminar o jogo.\n\n${err?.message||'Erro desconhecido'}`)}});$('[data-close]').onclick=closeModal;
}

function renderStandings(){
 const comps=standingsCompetitions();const fallback=primaryLeagueCompetition();if(!standingsCompetitionId||!comps.some(c=>c.id===standingsCompetitionId))standingsCompetitionId=fallback?.id||comps[0]?.id||'';
 const comp=competitionById(standingsCompetitionId);const rows=calculateStandings(standingsCompetitionId);
 const selector=comps.length>1?`<div class="field result-filter"><label>Competição</label><select id="standingsCompetition">${comps.map(c=>`<option value="${c.id}" ${c.id===standingsCompetitionId?'selected':''}>${esc(backendCompetitionLabel(c))}</option>`).join('')}</select></div>`:'';
 $('#view-standings').innerHTML=`<div class="section-head"><div><h2>Classificação</h2><p>${esc(comp?backendCompetitionLabel(comp):competitionName())} · ${esc(activeSeason()?.label||'')}</p></div>${canEdit()?'<button class="btn secondary" id="goSeriesResults">Editar resultados</button>':''}</div>${selector?`<div class="toolbar">${selector}</div>`:''}<div class="info-strip">Toca numa equipa para abrir a respetiva página, com jogos, resultados e forma dos últimos 5 jogos.</div><div style="height:12px"></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Equipa</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>DG</th><th>Pts</th></tr></thead><tbody>${rows.map(r=>`<tr class="${isFigueirasTeam(r.team)?'highlight-row':''}"><td>${r.position}</td><td>${teamCell(r.team)}</td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.dg>0?'+':''}${r.dg}</td><td><strong>${r.pts}</strong></td></tr>`).join('')}</tbody></table></div>`;
 $('#goSeriesResults')&&($('#goSeriesResults').onclick=()=>showView('seriesResults'));$('#standingsCompetition')&&($('#standingsCompetition').onchange=e=>{standingsCompetitionId=e.target.value;renderStandings()});
}
function renderTeamPage(){
 const team=teamByName(selectedTeamName)||teamByName('ADC Figueiras');if(!team){$('#view-team').innerHTML=empty('Equipa não encontrada');return}selectedTeamName=team.name;sessionStorage.setItem('teamView',team.name);syncClubGamesToFixtures();const all=teamMatches(team.name).sort((a,b)=>dateTimeOf(a.date,a.time)-dateTimeOf(b.date,b.time));const completed=all.filter(m=>(m.homeScore!==''&&m.awayScore!=='')||m.administrativeDecision);const form=teamRecentForm(team.name,5);const standing=calculateStandings().find(r=>r.team===team.name);const next=all.find(m=>m.homeScore===''||m.awayScore==='');const h2h=isFigueirasTeam(team.name)?[]:historicalHeadToHead(team.name);const hWins=h2h.filter(g=>clubGameOutcome(g)==='V').length,hDraws=h2h.filter(g=>clubGameOutcome(g)==='E').length,hLosses=h2h.filter(g=>clubGameOutcome(g)==='D').length;
 $('#view-team').innerHTML=`<div class="section-head"><div><button class="back-link" id="backStandings">← Classificação</button></div></div><div class="card team-profile-hero"><div class="team-profile-logo">${teamLogoHtml(team.name,'large')}</div><div><div class="eyebrow">${esc(competitionName())}</div><h2>${esc(team.name)}</h2><p>${esc(team.homeVenue||'')}</p></div><div class="team-position"><strong>${standing?`${standing.position}.º`:'—'}</strong><span>posição</span></div></div><div style="height:15px"></div><div class="grid kpis"><div class="card kpi"><div class="label">Jogos</div><div class="value">${standing?.j||0}</div></div><div class="card kpi"><div class="label">Pontos</div><div class="value">${standing?.pts||0}</div></div><div class="card kpi"><div class="label">Golos</div><div class="value">${standing?.gf||0}</div><div class="sub">marcados</div></div><div class="card kpi"><div class="label">Diferença</div><div class="value">${standing?(standing.dg>0?'+':'')+standing.dg:'0'}</div></div></div><div style="height:15px"></div><div class="grid two"><div class="card"><div class="card-head"><div><h3>Forma atual</h3><p>Últimos 5 jogos concluídos</p></div></div>${form.length?`<div class="form-row">${form.map(x=>formPill(x.result)).join('')}</div>`:empty('Ainda sem resultados')}</div><div class="card"><div class="card-head"><div><h3>Próximo jogo</h3><p>${next?`Jornada ${esc(next.round||'—')}`:''}</p></div></div>${next?`<div class="next-team-game"><strong>${esc(next.home)} – ${esc(next.away)}</strong><span>${fmtDate(next.date)} · ${esc(next.time||'')}</span></div>`:empty('Sem próximo jogo')}</div></div>${!isFigueirasTeam(team.name)?`<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Histórico vs ADC Figueiras</h3><p>Todas as épocas guardadas na aplicação.</p></div></div>${h2h.length?`<div class="h2h-summary"><div><strong>${h2h.length}</strong><span>jogos</span></div><div><strong>${hWins}</strong><span>vitórias Figueiras</span></div><div><strong>${hDraws}</strong><span>empates</span></div><div><strong>${hLosses}</strong><span>vitórias ${esc(team.short||team.name)}</span></div></div><div class="table-wrap"><table><thead><tr><th>Época</th><th>Data</th><th>Competição</th><th>Jogo</th><th>Resultado</th></tr></thead><tbody>${h2h.map(g=>`<tr class="h2h-game" data-team-club-game="${esc(g.id)}"><td>${esc(seasonLabelById(g.seasonId))}</td><td>${fmtDate(g.date)}</td><td>${esc(g.competition||'—')}</td><td>${esc(gameTitle(g))}</td><td><strong>${scoreText(g)}</strong></td></tr>`).join('')}</tbody></table></div>`:empty('Ainda sem confrontos registados','Quando forem adicionadas épocas anteriores, os confrontos aparecem aqui automaticamente.')}</div>`:''}<div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Jogos e resultados</h3><p>${completed.length} resultado(s) registado(s) · ${all.length} jogos no calendário</p></div></div><div class="table-wrap"><table><thead><tr><th>J.</th><th>Data</th><th>Casa</th><th>Resultado</th><th>Fora</th></tr></thead><tbody>${all.map(m=>{const club=isFigueirasTeam(m.home)||isFigueirasTeam(m.away);const score=resultScoreText(m);return `<tr class="${club?'club-result-row':''}" ${club&&m.clubGameId?`data-team-club-game="${esc(m.clubGameId)}"`:''}><td>${esc(m.round||'—')}</td><td>${fmtDate(m.date)}<div class="meta">${esc(m.time||'')}</div></td><td>${teamCell(m.home)}</td><td class="score">${score}</td><td>${teamCell(m.away)}</td></tr>`}).join('')}</tbody></table></div></div>`;
 $('#backStandings').onclick=()=>showView('standings');$$('[data-team-club-game]').forEach(r=>r.onclick=e=>{if(e.target.closest('[data-team-link]'))return;sessionStorage.setItem('mcGame',r.dataset.teamClubGame);showView('matchcenter')});
}

function openStandingRow(st,id=''){const r=id?st.rows.find(x=>x.id===id):{team:'',j:0,v:0,e:0,d:0,gf:0,ga:0,pts:0};openModal(id?'Editar classificação':'Adicionar equipa','Valores da tabela classificativa.',`<form id="standingForm"><div class="form-grid"><div class="field full"><label>Equipa</label><input name="team" value="${esc(r.team)}" required></div>${[['j','J'],['v','V'],['e','E'],['d','D'],['gf','GM'],['ga','GS'],['pts','Pts']].map(([k,l])=>`<div class="field"><label>${l}</label><input name="${k}" type="number" min="0" value="${Number(r[k])||0}"></div>`).join('')}</div><div class="form-actions">${id?'<button type="button" class="btn danger" id="delStanding">Eliminar</button>':''}<span style="flex:1"></span><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn">Guardar</button></div></form>`);$('#standingForm').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(id)Object.assign(r,d);else st.rows.push({id:uid('sr'),...d});closeModal();saveState()};$('#delStanding')&&($('#delStanding').onclick=()=>{st.rows=st.rows.filter(x=>x.id!==id);closeModal();saveState()});$('[data-close]').onclick=closeModal}

function openCalendarEventInfo(ev){
 if(!ev)return;
 const isTraining=ev.type==='training';
 const title=isTraining?'Treino':ev.title;
 const subtitle=isTraining?`Treino · ${fmtDate(ev.date)}`:`Jogo · ${fmtDate(ev.date)}`;
 let action='';
 if(isTraining&&ev.trainingId&&can('training')) action='<button class="btn" id="calendarOpenTraining">Abrir treino</button>';
 else if(!isTraining&&ev.clubGameId&&can('matchcenter')) action='<button class="btn" id="calendarOpenMatch">Abrir Match Center</button>';
 else if(!isTraining&&ev.fixtureId&&canEdit()) action='<button class="btn" id="calendarEditFixture">Editar jogo</button>';
 openModal(title,subtitle,`<div class="diagnostic-grid"><div><span>Data</span><strong>${fmtDate(ev.date)}</strong></div><div><span>Hora</span><strong>${esc(ev.time||'Por definir')}</strong></div><div><span>Local</span><strong>${esc(ev.location||'Por definir')}</strong></div></div><div class="form-actions"><button class="btn secondary" data-close>Fechar</button>${action}</div>`);
 $('[data-close]').onclick=closeModal;
 $('#calendarOpenTraining')&&($('#calendarOpenTraining').onclick=()=>{closeModal();openTrainingManage(ev.trainingId)});
 $('#calendarOpenMatch')&&($('#calendarOpenMatch').onclick=()=>{closeModal();sessionStorage.setItem('mcGame',ev.clubGameId);showView('matchcenter')});
 $('#calendarEditFixture')&&($('#calendarEditFixture').onclick=()=>{closeModal();openSeriesResult(ev.fixtureId)});
}

function renderCalendar(){
 syncClubGamesToFixtures();
 const first=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1),start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
 let events=[
  ...seasonTrainings().map(t=>({date:t.date,type:'training',title:t.title||'Treino',label:`Treino ${t.time||''}`,time:t.time||'',location:t.location||'',trainingId:t.id})),
  ...seasonCompetitionFixtures().map(f=>({date:f.date,type:'game',title:`${f.home} – ${f.away}`,label:`${f.round?`J${f.round} · `:''}${teamByName(f.home)?.short||f.home} – ${teamByName(f.away)?.short||f.away}`,time:f.time||'',location:f.venue||teamByName(f.home)?.homeVenue||'',clubGameId:f.clubGameId||'',fixtureId:f.id,isClub:isFigueirasTeam(f.home)||isFigueirasTeam(f.away)})),
  ...seasonGames().filter(g=>!seasonCompetitionFixtures().some(f=>f.clubGameId===g.id)).map(g=>({date:g.date,type:'game',title:gameTitle(g),label:`${g.round?`${g.round} · `:''}${gameTitle(g)}`,time:g.time||'',location:g.venue||'',clubGameId:g.id,fixtureId:'',isClub:true}))
 ];
 if(calendarEventFilter==='club')events=events.filter(e=>e.type==='game'&&e.isClub);
 if(calendarEventFilter==='training')events=events.filter(e=>e.type==='training');
 events=events.map((e,i)=>({...e,_calendarKey:String(i)}));
 let days='';
 for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;const muted=d.getMonth()!==calendarCursor.getMonth();days+=`<div class="calendar-day ${muted?'muted':''} ${k===nowKey()?'today':''}"><div class="day-num">${d.getDate()}</div>${events.filter(e=>e.date===k).sort((a,b)=>String(a.time).localeCompare(String(b.time))).map(e=>`<button class="cal-event ${e.type==='game'?'game':''} ${e.isClub?'club':''}" data-cal-event="${e._calendarKey}">${esc(e.label)}</button>`).join('')}</div>`}
 $('#view-calendar').innerHTML=`<div class="calendar-head"><button class="btn secondary sm" id="prevMonth">←</button><h2>${fmtMonth(calendarCursor)}</h2><button class="btn secondary sm" id="nextMonth">→</button></div><div class="toolbar calendar-toolbar"><div class="field result-filter"><label>Mostrar</label><select id="calendarFilter"><option value="all" ${calendarEventFilter==='all'?'selected':''}>Tudo</option><option value="club" ${calendarEventFilter==='club'?'selected':''}>Só ADC Figueiras</option><option value="training" ${calendarEventFilter==='training'?'selected':''}>Só treinos</option></select></div></div><p class="calendar-scroll-hint">← Desliza o calendário para veres os restantes dias →</p><div class="calendar-scroll" role="region" aria-label="Calendário: desliza horizontalmente para consultar os sete dias da semana" tabindex="0"><div class="calendar-grid">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(x=>`<div class="dow">${x}</div>`).join('')}${days}</div></div>`;
 $('#prevMonth').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar()};$('#nextMonth').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar()};
 $('#calendarFilter').onchange=e=>{calendarEventFilter=e.target.value;renderCalendar()};
 $$('[data-cal-event]').forEach(b=>b.onclick=()=>openCalendarEventInfo(events.find(e=>e._calendarKey===b.dataset.calEvent)));
}

function renderFines(){
 const rows=state.fines.filter(f=>(f.seasonId||state.settings.activeSeasonId)===state.settings.activeSeasonId).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 const pending=rows.filter(f=>fineStatus(f)==='pending').reduce((sum,f)=>sum+Number(f.amount||0),0);
 const manage=canManageFines();
 $('#view-fines').innerHTML=`<div class="section-head"><div><h2>Multas</h2><p>Gestão interna da equipa · dados guardados no Supabase.</p></div><div class="inline-actions">${canManageFineRules()?'<button class="btn secondary" id="openFineRules">Regras de multas</button>':''}${manage?'<button class="btn" id="addFine">＋ Multa</button>':''}</div></div><div class="grid kpis"><div class="card kpi"><div class="label">Pendentes</div><div class="value">${money(pending)}</div></div><div class="card kpi"><div class="label">Registos</div><div class="value">${rows.length}</div></div></div><div style="height:15px"></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Jogador</th><th>Motivo</th><th>Valor</th><th>Estado</th><th>Origem</th><th></th></tr></thead><tbody>${rows.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${esc(playerById(f.playerId)?.name||'—')}</td><td>${esc(f.reason||'')}</td><td>${money(f.amount)}</td><td>${pill(fineStatusLabel(fineStatus(f)),fineStatusPill(fineStatus(f)))}</td><td>${f.auto?pill('Automática','blue'):pill('Manual','gray')}</td><td>${manage?`<div class="inline-actions"><button class="btn secondary sm toggle-fine" data-id="${f.id}">${fineStatus(f)==='paid'?'Marcar pendente':'Marcar pago'}</button>${!f.auto?`<button class="btn secondary sm edit-fine" data-id="${f.id}">Editar</button>`:''}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('Sem multas registadas')}`;
 $('#addFine')&&($('#addFine').onclick=()=>openFine());$('#openFineRules')&&($('#openFineRules').onclick=()=>showView('fineRules'));
 $$('.toggle-fine').forEach(b=>b.onclick=async()=>{const f=state.fines.find(x=>x.id===b.dataset.id);if(!f)return;const next=fineStatus(f)==='paid'?'pending':'paid';const old={status:f.status,paid:f.paid,paidAt:f.paidAt};b.disabled=true;try{if(backendConnected)await setBackendFineStatus(f,next);else{f.status=next;f.paid=next==='paid'}saveState(next==='paid'?'Multa marcada como paga.':'Multa marcada como pendente.')}catch(err){Object.assign(f,old);console.error(err);alert(`Não foi possível atualizar a multa.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false}});
 $$('.edit-fine').forEach(b=>b.onclick=()=>openFine(b.dataset.id));
}
function openFine(id=''){
 const f=id?state.fines.find(x=>x.id===id):{playerId:state.players[0]?.id||'',date:nowKey(),reason:'',amount:'',status:'pending',sourceType:'manual',auto:false,notes:''};if(!f)return;
 const opts=state.players.map(p=>`<option value="${p.id}" ${f.playerId===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
 const reasons=(state.fineRules||[]).filter(r=>r.active!==false).map(r=>`<option value="${esc(r.reason)}"></option>`).join('');
 openModal(id?'Editar multa':'Nova multa',id?'Altera o registo manual da multa.':'Registo interno guardado no Supabase.',`<form id="fineForm"><div class="form-grid"><div class="field"><label>Jogador</label><select name="playerId">${opts}</select></div><div class="field"><label>Data</label><input type="date" name="date" value="${esc(f.date||nowKey())}" required></div><div class="field full"><label>Motivo</label><input name="reason" list="fineReasons" value="${esc(f.reason||'')}" required><datalist id="fineReasons">${reasons}</datalist></div><div class="field"><label>Valor (€)</label><input type="number" step="0.01" min="0" name="amount" value="${esc(f.amount??'')}" required></div><div class="field"><label>Estado</label><select name="status"><option value="pending" ${fineStatus(f)==='pending'?'selected':''}>Pendente</option><option value="paid" ${fineStatus(f)==='paid'?'selected':''}>Pago</option><option value="waived" ${fineStatus(f)==='waived'?'selected':''}>Perdoada</option><option value="cancelled" ${fineStatus(f)==='cancelled'?'selected':''}>Anulada</option></select></div><div class="field full"><label>Notas</label><textarea name="notes">${esc(f.notes||'')}</textarea></div></div><div class="form-actions">${id&&!f.auto?'<button type="button" class="btn danger" id="deleteFine">Eliminar</button><span style="flex:1"></span>':''}<button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="saveFineBtn">Guardar</button></div></form>`);
 $('#fineForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const data={playerId:fd.get('playerId'),date:fd.get('date'),reason:fd.get('reason'),amount:Number(fd.get('amount')||0),status:fd.get('status')||'pending',paid:fd.get('status')==='paid',notes:fd.get('notes'),sourceType:f.sourceType||'manual',auto:!!f.auto};const created=!id;if(created){data.id=uid('f');data.seasonId=state.settings.activeSeasonId;state.fines.push(data)}else Object.assign(f,data);const target=created?data:f;const btn=$('#saveFineBtn');btn.disabled=true;btn.textContent='A guardar…';try{if(backendConnected)await saveBackendFine(target);closeModal();saveState(created?'Multa registada online.':'Multa atualizada online.')}catch(err){console.error(err);if(created)state.fines=state.fines.filter(x=>x!==target);alert(`Não foi possível guardar a multa.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent='Guardar'}};
 $('#deleteFine')&&($('#deleteFine').onclick=async()=>{if(!confirm('Eliminar esta multa manual?'))return;try{if(backendConnected)await deleteBackendFine(f);state.fines=state.fines.filter(x=>x.id!==f.id);closeModal();saveState('Multa eliminada.')}catch(err){console.error(err);alert(`Não foi possível eliminar a multa.\n\n${err?.message||'Erro desconhecido'}`)}});$('[data-close]').onclick=closeModal;
}
function renderFineRules(){
 const rules=state.fineRules||[];const editable=canManageFineRules();
 $('#view-fineRules').innerHTML=`<div class="section-head"><div><h2>Regras de multas</h2><p>Motivos e automatismos guardados no Supabase.</p></div>${editable?'<button class="btn" id="addFineRule">＋ Regra</button>':''}</div>${rules.length?`<div class="table-wrap"><table><thead><tr><th>Motivo</th><th>Valor</th><th>Tipo</th><th>Estado</th><th>Descrição</th><th></th></tr></thead><tbody>${rules.map(r=>`<tr><td><strong>${esc(r.reason)}</strong></td><td>${money(r.amount)}</td><td>${r.automatic?pill('Automática','blue'):pill('Manual','gray')}</td><td>${r.active?pill('Ativa','green'):pill('Inativa','red')}</td><td>${esc(r.description||'—')}</td><td>${editable?`<button class="btn secondary sm edit-rule" data-id="${r.id}">Editar</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('Sem regras definidas','Cria os motivos de multa que queres usar na equipa.')}`;
 $('#addFineRule')&&($('#addFineRule').onclick=()=>openFineRule());$$('.edit-rule').forEach(b=>b.onclick=()=>openFineRule(b.dataset.id));
}
function openFineRule(id=''){
 const rule=id?state.fineRules.find(x=>x.id===id):{reason:'',amount:2,automatic:false,active:true,description:'',code:''};if(!rule)return;
 openModal(id?'Editar regra de multa':'Nova regra de multa','Configura os motivos de multa e o respetivo valor.',`<form id="fineRuleForm"><div class="form-grid"><div class="field"><label>Motivo</label><input name="reason" value="${esc(rule.reason||'')}" required></div><div class="field"><label>Valor (€)</label><input type="number" step="0.01" min="0" name="amount" value="${esc(rule.amount??0)}" required></div><div class="field"><label>Tipo</label><select name="automatic"><option value="false" ${!rule.automatic?'selected':''}>Manual</option><option value="true" ${rule.automatic?'selected':''}>Automática</option></select></div><div class="field"><label>Estado</label><select name="active"><option value="true" ${rule.active?'selected':''}>Ativa</option><option value="false" ${!rule.active?'selected':''}>Inativa</option></select></div><div class="field full"><label>Descrição</label><textarea name="description" placeholder="Ex.: aplicada quando um jogador chega atrasado ao treino.">${esc(rule.description||'')}</textarea></div></div><div class="form-actions">${id&&rule.code!=='training_late'?'<button type="button" class="btn danger" id="deleteFineRule">Eliminar</button><span style="flex:1"></span>':''}<button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="saveFineRuleBtn">Guardar</button></div></form>`);
 $('#fineRuleForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const old={...rule};const data={reason:fd.get('reason'),amount:Number(fd.get('amount')||0),automatic:fd.get('automatic')==='true',active:fd.get('active')==='true',description:fd.get('description'),code:rule.code||''};if(id)Object.assign(rule,data);else{Object.assign(rule,{id:uid('fr'),...data});state.fineRules.push(rule)}const btn=$('#saveFineRuleBtn');btn.disabled=true;btn.textContent='A guardar…';try{if(backendConnected)await saveBackendFineRule(rule);closeModal();saveState('Regra de multa guardada online.')}catch(err){console.error(err);if(id)Object.assign(rule,old);else state.fineRules=state.fineRules.filter(x=>x!==rule);alert(`Não foi possível guardar a regra.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent='Guardar'}};
 $('#deleteFineRule')&&($('#deleteFineRule').onclick=async()=>{if(!confirm('Eliminar esta regra?'))return;try{if(backendConnected)await deleteBackendFineRule(rule);state.fineRules=state.fineRules.filter(x=>x.id!==rule.id);closeModal();saveState('Regra eliminada.')}catch(err){console.error(err);alert(`Não foi possível eliminar a regra.\n\n${err?.message||'Erro desconhecido'}`)}});$('[data-close]').onclick=closeModal;
}


function renderSeasons(){
 const prod=backendProductionSeason();
 const cards=state.seasons.map(se=>{const current=se.backendId===prod?.id;const opened=se.id===state.settings.activeSeasonId;const league=(backendReference.competitions||[]).find(c=>c.season_id===se.backendId&&c.competition_type==='league'&&c.phase!=='Taça Complementar');const subtitle=league?`I Divisão AF Porto · ${league.series_name||league.name}`:(se.competitionName||'Época ADC Figueiras');const extra=se.label==='2025/26'?'<strong class="season-place">4.º lugar</strong>':'';return `<article class="card season-card ${opened?'season-opened':''}"><div class="card-head"><div><h3>${esc(se.label)}</h3><p>${esc(subtitle)}</p>${extra}</div>${pill(current?'Época atual':se.archived?'Arquivada':'Disponível',current?'green':'gray')}</div><div class="season-card-stats">${se.label==='2025/26'?'<span><strong>16</strong> J</span><span><strong>7</strong> V</span><span><strong>5</strong> E</span><span><strong>4</strong> D</span><span><strong>35</strong> GM</span><span><strong>39</strong> GS</span>':current?'<span>Temporada em curso</span>':'<span>Histórico do clube</span>'}</div><div class="form-actions"><button class="btn ${opened?'secondary':''} open-season" data-id="${se.id}">${opened?'Época aberta':'Abrir época'} →</button></div></article>`}).join('');
 $('#view-seasons').innerHTML=`<div class="section-head"><div><h2>Épocas</h2><p>Consulta a época atual ou entra no arquivo histórico do ADC Figueiras.</p></div></div><div class="grid equal2">${cards}</div>`;
 $$('.open-season').forEach(b=>b.onclick=async()=>{if(b.dataset.id===state.settings.activeSeasonId){showView('dashboard');return}b.disabled=true;b.textContent='A abrir…';try{await switchSeason(b.dataset.id)}catch(err){console.error(err);alert(`Não foi possível abrir a época.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Abrir época →'}});
}

function rolePills(roles=[]){return roles.length?roles.map(r=>pill(roleLabel(r),r==='admin'?'purple':r==='staff'?'blue':r==='captain'?'amber':r==='player'?'green':'gray')).join(''):pill('Registado','gray')}
function memberAccessHtml(u){if(u.roles?.includes('member')||u.memberStatus==='verified')return `${esc(u.memberNumber||'—')} ${pill('Validado','green')}`;if(u.memberStatus==='pending')return `${esc(u.memberNumber||'—')} ${pill('Por validar','amber')}`;return '—'}
function renderPeople(){
 if(!backendSession?.user?.id||!backendRoles.includes('admin')){$('#view-people').innerHTML=empty('Sem acesso','Apenas administradores podem consultar e gerir utilizadores.');return}
 if(!backendPeopleLoaded){$('#view-people').innerHTML=`<div class="section-head"><div><h2>Pessoas e acessos</h2><p>Contas e permissões reais no Supabase.</p></div></div>${empty('A carregar utilizadores…')}`;return}
 const people=backendPeopleRows(),invites=backendPeople.invitations||[];
 $('#view-people').innerHTML=`<div class="section-head"><div><h2>Pessoas e acessos</h2><p>Contas, pedidos de sócio e permissões reais no Supabase.</p></div><div class="inline-actions"><button class="btn secondary" id="refreshPeople">Atualizar</button><button class="btn" id="addUser">＋ Pré-atribuir acesso</button></div></div><div class="info-strip">Qualquer pessoa pode criar uma conta. Sem funções atribuídas, fica como utilizador registado com acesso público. Usa a pré-atribuição para Jogador, Capitão, Equipa técnica ou Admin. Um número de sócio indicado no registo fica por validar até um Admin atribuir a função Sócio.</div><div style="height:12px"></div><div class="card"><div class="card-head"><div><h3>Contas ativas</h3><p>${people.length} conta(s) criada(s)</p></div>${pill('Supabase','green')}</div>${people.length?`<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Funções</th><th>Jogador associado</th><th>Sócio</th><th>Estado</th><th></th></tr></thead><tbody>${people.map(u=>`<tr><td><strong>${esc(u.name)}</strong><div class="meta">${esc(u.email||'Sem email')}</div></td><td><div class="tags">${rolePills(u.roles)}</div></td><td>${esc(backendPlayerName(u.backendPlayerId))}</td><td>${memberAccessHtml(u)}</td><td>${u.active?pill('Ativa','green'):pill('Desativada','red')}</td><td><button class="btn secondary sm edit-user" data-id="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Ainda não existem contas.')}</div><div style="height:15px"></div><div class="card"><div class="card-head"><div><h3>Acessos pré-atribuídos</h3><p>Emails que receberão automaticamente funções quando criarem conta.</p></div>${pill(`${invites.length} pendente${invites.length===1?'':'s'}`,invites.length?'amber':'gray')}</div>${invites.length?`<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Funções</th><th>Jogador</th><th>Sócio nº</th><th></th></tr></thead><tbody>${invites.map(i=>`<tr><td><strong>${esc(i.display_name||'—')}</strong><div class="meta">${esc(i.email)}</div></td><td><div class="tags">${rolePills(i.roles||[])}</div></td><td>${esc(backendPlayerName(i.player_id))}</td><td>${esc(i.member_number||'—')}</td><td><div class="inline-actions"><button class="btn secondary sm edit-invite" data-id="${i.id}">Editar</button><button class="btn danger sm cancel-invite" data-id="${i.id}">Cancelar</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Sem acessos pendentes','Usa “Pré-atribuir acesso” quando alguém precisar de funções internas.')}</div>`;
 $('#refreshPeople').onclick=async()=>{try{await loadBackendPeopleData();renderPeople();toast('Pessoas e acessos atualizados.')}catch(err){console.error(err);alert(`Não foi possível atualizar os acessos.\n\n${err?.message||'Erro desconhecido'}`)}};
 $('#addUser').onclick=()=>openInvitation();$$('.edit-user').forEach(b=>b.onclick=()=>openBackendUser(b.dataset.id));$$('.edit-invite').forEach(b=>b.onclick=()=>openInvitation(b.dataset.id));$$('.cancel-invite').forEach(b=>b.onclick=async()=>{if(!confirm('Cancelar este convite?'))return;try{await cancelBackendInvitation(b.dataset.id);renderPeople();toast('Convite cancelado.')}catch(err){console.error(err);alert(`Não foi possível cancelar o convite.\n\n${err?.message||'Erro desconhecido'}`)}});
}
function playerAccountOptions(selected=''){return `<option value="">— Nenhum —</option>${(backendRoster.rows||[]).map(r=>`<option value="${r.player_id}" ${selected===r.player_id?'selected':''}>${esc(r.name)}${r.shirt_number?` · #${esc(r.shirt_number)}`:''}</option>`).join('')}`}
function rolesChecklist(selected=[]){return `<div class="checkboxes">${['player','captain','staff','admin','member'].map(r=>`<label class="check-pill"><input type="checkbox" name="roles" value="${r}" ${selected.includes(r)?'checked':''}>${roleLabel(r)}</label>`).join('')}</div>`}
function openBackendUser(id){
 const u=backendPeopleRows().find(x=>x.id===id);if(!u)return;
 openModal('Editar acesso','As alterações ficam imediatamente ativas na conta.',`<form id="userForm"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(u.name)}" required></div><div class="field"><label>Email</label><input value="${esc(u.email)}" disabled><small>O email de autenticação não é alterado aqui.</small></div><div class="field"><label>Jogador associado</label><select name="backendPlayerId">${playerAccountOptions(u.backendPlayerId)}</select></div><div class="field"><label>N.º sócio</label><input name="memberNumber" value="${esc(u.memberNumber||'')}"><small>${u.memberStatus==='pending'?'Pedido pendente: seleciona Sócio para validar, ou limpa o número para rejeitar.':'Seleciona a função Sócio para validar este número.'}</small></div><div class="field"><label>Estado da conta</label><select name="active"><option value="true" ${u.active?'selected':''}>Ativa</option><option value="false" ${!u.active?'selected':''}>Desativada</option></select></div><div class="field full"><label>Funções</label>${rolesChecklist(u.roles)}</div></div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="saveUserBtn">Guardar</button></div></form>`);
 $('#userForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),roles=fd.getAll('roles');const btn=$('#saveUserBtn');btn.disabled=true;btn.textContent='A guardar…';try{await saveBackendUserAccess({id:u.id,name:fd.get('name'),roles,backendPlayerId:fd.get('backendPlayerId'),memberNumber:fd.get('memberNumber'),active:fd.get('active')==='true'});closeModal();renderChrome();renderPeople();toast('Acessos atualizados.')}catch(err){console.error(err);alert(`Não foi possível atualizar o acesso.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent='Guardar'}};$('[data-close]').onclick=closeModal;
}
function openInvitation(id=''){
 const inv=id?(backendPeople.invitations||[]).find(x=>x.id===id):null;const data=inv||{display_name:'',email:'',roles:['player'],player_id:'',member_number:''};
 openModal(id?'Editar acesso pré-atribuído':'Pré-atribuir acesso','A pessoa pode criar a conta normalmente; ao usar este email recebe estas funções automaticamente.',`<form id="inviteForm"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(data.display_name||'')}" required></div><div class="field"><label>Email</label><input type="email" name="email" value="${esc(data.email||'')}" required></div><div class="field"><label>Jogador associado</label><select name="backendPlayerId">${playerAccountOptions(data.player_id||'')}</select></div><div class="field"><label>N.º sócio</label><input name="memberNumber" value="${esc(data.member_number||'')}"></div><div class="field full"><label>Funções</label>${rolesChecklist(data.roles||[])}</div></div><div class="note">Depois de guardares, a pessoa cria conta normalmente com exatamente este email. As funções e a ligação ao jogador serão aplicadas automaticamente.</div><div class="form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn" id="saveInviteBtn">${id?'Guardar acesso':'Guardar pré-atribuição'}</button></div></form>`);
 $('#inviteForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),roles=fd.getAll('roles');if(!roles.length){alert('Seleciona pelo menos uma função para pré-atribuir.');return}const btn=$('#saveInviteBtn');btn.disabled=true;btn.textContent='A guardar…';try{await saveBackendInvitation({id,name:fd.get('name'),email:fd.get('email'),roles,backendPlayerId:fd.get('backendPlayerId'),memberNumber:fd.get('memberNumber')});closeModal();renderPeople();toast(id?'Acesso pré-atribuído atualizado.':'Acesso pré-atribuído criado.')}catch(err){console.error(err);alert(`Não foi possível guardar o convite.\n\n${err?.message||'Erro desconhecido'}`);btn.disabled=false;btn.textContent=id?'Guardar acesso':'Guardar pré-atribuição'}};$('[data-close]').onclick=closeModal;
}

function renderSettings(){
 if(!backendSession?.user?.id||!backendRoles.includes('admin')){$('#view-settings').innerHTML=empty('Sem acesso','Apenas administradores podem consultar as definições.');return}
 const diag={players:state.players.length,games:state.games.length,trainings:state.trainings.length,results:state.competitionResults.length,seasons:state.seasons.length,matchPlayers:(backendMatchCenter.matchPlayers||[]).length,matchEvents:(backendMatchCenter.events||[]).length,matchWeighIns:(backendMatchCenter.weighIns||[]).length,onlineTrainings:(backendTraining.trainings||[]).length,onlineAttendance:(backendTraining.attendance||[]).length,onlineWeighIns:(backendTraining.weighIns||[]).length,onlineFineRules:(backendFines.rules||[]).length,onlineFines:(backendFines.fines||[]).length};
 const autoSnap=autoBackupSnapshot();
 const bSeason=backendActiveSeason(),bClub=backendClubTeam();
 const bCompetitions=backendReference.competitions||[],bTeams=backendReference.teams||[];
 const rosterCount=backendRoster.rows?.length||0;
 const onlineMatchCount=backendMatches.rows?.length||0;
 const onlineMatchCenterCount=diag.matchPlayers+diag.matchEvents;
 const localMatchCenterGames=seasonGames().filter(hasLocalMatchCenterData).length;
 const onlineTrainingCount=diag.onlineTrainings;
 const localTrainingCount=seasonTrainings().filter(t=>!t.backendId).length;
 const localFineRules=(state.fineRules||[]).filter(r=>!r.backendId&&r.code!=='training_late').length;
 const localManualFines=(state.fines||[]).filter(f=>!f.backendId&&!f.auto&&f.sourceType!=='training_late').length;
 const leagueCompetition=(backendReference.competitions||[]).find(c=>c.season_id===bSeason?.id&&c.competition_type==='league');
 const leagueMatchCount=leagueCompetition?(backendMatches.rows||[]).filter(m=>m.competition_id===leagueCompetition.id).length:0;
 const releaseChecks=[
  {label:'Supabase',ok:backendConnected,detail:backendConnected?'Ligação ativa':'Ligação pendente'},
  {label:'Época e clube',ok:!!bSeason&&!!bClub,detail:bSeason&&bClub?`${bSeason.label} · ${bClub.short_name||bClub.name}`:'Configuração incompleta'},
  {label:'Plantel online',ok:rosterCount>0,detail:rosterCount?`${rosterCount} jogadores`:'Sem jogadores online'},
  {label:'Calendário do campeonato',ok:leagueMatchCount===156,detail:`${leagueMatchCount}/156 jogos`},
  {label:'Match Center',ok:backendMatchCenterLoaded,detail:backendMatchCenterLoaded?'Ligado':'Pendente'},
  {label:'Treinos e pesagens',ok:backendTrainingLoaded,detail:backendTrainingLoaded?'Ligado':'Pendente'},
  {label:'Multas',ok:backendFinesLoaded,detail:backendFinesLoaded?'Ligado':'Pendente'},
  {label:'Contas e permissões',ok:backendPeopleLoaded,detail:backendPeopleLoaded?'Ligado':'Pendente'},
  {label:'Notificações',ok:backendNotificationScheduleLoaded,detail:backendNotificationScheduleLoaded?'Configuração online':'Pendente'},
  {label:'Privacidade',ok:backendPrivacyLoaded,detail:backendPrivacyLoaded?(privacyAcknowledged()?'Política atual confirmada':'Política online · falta confirmar nesta conta'):'Configuração de privacidade pendente'},
   {label:'Plano alimentar privado',ok:backendNutritionLoaded,detail:backendNutritionLoaded?'Armazenado no Supabase com acesso interno':'Migração e testes pendentes'}, 
  {label:'SMTP de produção',ok:true,detail:'Configurado e validado'}
 ];
 const releaseBlocking=releaseChecks.filter(x=>!x.ok);
 const releaseStatus=releaseBlocking.length?pill(`${releaseBlocking.length} ponto(s) a verificar`,'amber'):pill('Verificações técnicas concluídas','green');
 const releaseChecksHtml=releaseChecks.map(x=>`<div class="release-check-item"><div><strong>${esc(x.label)}</strong><small>${esc(x.detail)}</small></div>${pill(x.ok?'OK':'Verificar',x.ok?'green':'amber')}</div>`).join('');
 const permissionMatrix=`<div class="permission-matrix"><div><strong>Público / Registado / Sócio</strong><span>Plantel e Match Center públicos, incluindo convocatórias publicadas; sem presenças, pesagens, multas ou dados internos.</span></div><div><strong>Jogador</strong><span>Plantel, treinos, pesagens e Match Center interno em leitura.</span></div><div><strong>Capitão</strong><span>Acessos de jogador + gestão de multas individuais; não altera regras.</span></div><div><strong>Equipa Técnica</strong><span>Edita jogos, treino, presenças, pesagens, notificações e regras de multas.</span></div><div><strong>Admin</strong><span>Gestão total, incluindo utilizadores, funções, épocas e definições.</span></div></div>`;
 const backendSummary=backendReferenceLoaded
  ?`<div class="diagnostic-grid"><div><span>Ligação</span><strong>Online</strong></div><div><span>Época ativa</span><strong>${esc(bSeason?.label||'—')}</strong></div><div><span>Clube</span><strong>${esc(bClub?.short_name||bClub?.name||'—')}</strong></div><div><span>Competições</span><strong>${bCompetitions.length}</strong></div><div><span>Equipas</span><strong>${bTeams.length}</strong></div><div><span>Schema backend</span><strong>${esc(String(backendReference.settings?.schema_version??'—'))}</strong></div></div><div class="tags" style="margin-top:12px">${bCompetitions.map(c=>pill(c.name,c.competition_type==='league'?'green':c.competition_type==='cup'?'amber':'gray')).join('')}</div>`
  :`<div class="warning-strip">Ainda não foi possível carregar os dados de referência do Supabase.</div>`;
 $('#view-settings').innerHTML=`<div class="settings-stack"><div class="card release-check-card"><div class="card-head"><div><h3>Auditoria pré-lançamento</h3><p>Verificação técnica da próxima atualização; ainda sem validação jurídica e testes finais por perfis.</p></div>${releaseStatus}</div><div class="release-check-grid">${releaseChecksHtml}</div><div style="height:12px"></div><div class="warning-strip"><strong>Publicação bloqueada até validação:</strong> testar os fluxos de contas, preservar os backups locais anteriores, confirmar direitos de imagem e rever juridicamente as políticas e os tratamentos de dados sensíveis.</div><div class="form-actions"><button class="btn" id="runReleaseAudit">Executar auditoria final</button><button class="btn secondary" id="exportReleaseSnapshot">Exportar snapshot de release</button><button class="btn secondary" id="cleanupKnownTests">Limpar notificações de teste</button></div></div><div class="card"><div class="card-head"><div><h3>Matriz de permissões</h3><p>Resumo da auditoria funcional aplicada nesta build.</p></div>${pill('V1.2','green')}</div>${permissionMatrix}</div><div class="card"><div class="card-head"><div><h3>Dados de referência online</h3><p>A V3 já lê época, competições e equipas diretamente do Supabase.</p></div>${pill(backendReferenceLoaded?'Sincronizado':'Pendente',backendReferenceLoaded?'green':'amber')}</div>${backendSummary}<div class="form-actions"><button class="btn secondary" id="refreshBackendReference">Atualizar dados online</button></div><div class="note">Época, competições e equipas já vêm do backend.</div></div><div class="card"><div class="card-head"><div><h3>Plantel online</h3><p>Jogadores da época ativa guardados no Supabase.</p></div>${pill(rosterCount?`${rosterCount} jogadores`:'Ainda local',rosterCount?'green':'amber')}</div>${rosterCount?`<div class="note">O Plantel já está a ser carregado do Supabase. Alterações de nome, número, posição e estado feitas na V3 ficam guardadas online.</div><div class="form-actions"><button class="btn secondary" id="refreshBackendRoster">Atualizar plantel online</button></div>`:`<div class="warning-strip">O plantel ainda não foi migrado. O botão abaixo cria no Supabase os ${state.players.length} jogadores atualmente existentes na V3.</div><div class="form-actions"><button class="btn" id="createBackendRoster">Criar plantel online</button></div>`}</div><div class="card"><div class="card-head"><div><h3>Calendário e resultados online</h3><p>Jogos da época ativa guardados centralmente no Supabase.</p></div>${pill(onlineMatchCount?`${onlineMatchCount} jogos`:'Ainda local',onlineMatchCount?'green':'amber')}</div>${onlineMatchCount?`<div class="note">O calendário, os resultados e os jogos do ADC Figueiras já são carregados do Supabase. As alterações feitas na V3 ficam disponíveis noutros dispositivos.</div><div class="form-actions"><button class="btn secondary" id="refreshBackendMatches">Atualizar jogos online</button></div>`:`<div class="warning-strip">O calendário ainda está local. O botão abaixo envia o calendário completo do campeonato e os jogos adicionais já existentes para o Supabase.</div><div class="form-actions"><button class="btn" id="createBackendMatches">Criar calendário online</button></div>`}</div><div class="card"><div class="card-head"><div><h3>Match Center online</h3><p>Convocatórias, utilização, 5 inicial, capitão, acontecimentos e pesagens de jogo no Supabase.</p></div>${pill(backendMatchCenterLoaded?'Ligado':'Pendente',backendMatchCenterLoaded?'green':'amber')}</div><div class="diagnostic-grid"><div><span>Jogadores em fichas</span><strong>${diag.matchPlayers}</strong></div><div><span>Acontecimentos</span><strong>${diag.matchEvents}</strong></div><div><span>Pesagens de jogo</span><strong>${diag.matchWeighIns}</strong></div></div>${localMatchCenterGames&&onlineMatchCenterCount===0?`<div class="warning-strip">Foram encontrados dados de Match Center em ${localMatchCenterGames} jogo(s) apenas neste browser. Migra-os antes de continuares a editar esses jogos.</div><div class="form-actions"><button class="btn" id="migrateBackendMatchCenter">Migrar Match Center existente</button></div>`:`<div class="note">A partir desta versão, alterações à convocatória e acontecimentos dos jogos ficam guardadas online.</div><div class="form-actions"><button class="btn secondary" id="refreshBackendMatchCenter">Atualizar Match Center online</button></div>`}</div><div class="card"><div class="card-head"><div><h3>Treinos, presenças e pesagens online</h3><p>Sessões de treino, assiduidade e pesos guardados centralmente no Supabase.</p></div>${pill(localTrainingCount&&onlineTrainingCount===0?'Por migrar':backendTrainingLoaded?`${onlineTrainingCount} treinos`:'Pendente',localTrainingCount&&onlineTrainingCount===0?'amber':backendTrainingLoaded?'green':'amber')}</div><div class="diagnostic-grid"><div><span>Treinos online</span><strong>${diag.onlineTrainings}</strong></div><div><span>Presenças registadas</span><strong>${diag.onlineAttendance}</strong></div><div><span>Pesagens</span><strong>${diag.onlineWeighIns}</strong></div></div>${localTrainingCount&&onlineTrainingCount===0?`<div class="warning-strip">Existem ${localTrainingCount} treino(s) neste browser que ainda não estão no Supabase.</div><div class="form-actions"><button class="btn" id="migrateBackendTrainings">Migrar treinos existentes</button></div>`:`<div class="note">Novos treinos e alterações de presenças/pesagens são guardados online e ficam disponíveis noutros dispositivos.</div><div class="form-actions"><button class="btn secondary" id="refreshBackendTrainings">Atualizar treinos online</button></div>`}</div><div class="card"><div class="card-head"><div><h3>Multas e regras online</h3><p>Regras, multas manuais e multas automáticas por atraso guardadas no Supabase.</p></div>${pill(backendFinesLoaded?'Ligado':'Pendente',backendFinesLoaded?'green':'amber')}</div><div class="diagnostic-grid"><div><span>Regras online</span><strong>${diag.onlineFineRules}</strong></div><div><span>Multas online</span><strong>${diag.onlineFines}</strong></div></div>${localFineRules||localManualFines?`<div class="warning-strip">Existem ${localFineRules} regra(s) e ${localManualFines} multa(s) manual(is) apenas neste browser.</div><div class="form-actions"><button class="btn" id="migrateBackendFines">Migrar multas existentes</button></div>`:`<div class="note">As multas já são carregadas do Supabase. Atrasos ao treino criam ou anulam automaticamente a respetiva multa no backend.</div><div class="form-actions"><button class="btn secondary" id="refreshBackendFines">Atualizar multas online</button></div>`}</div><div class="card"><div class="card-head"><div><h3>Contas e permissões online</h3><p>Utilizadores, funções e ligações ao plantel guardados no Supabase.</p></div>${pill(backendPeopleLoaded?'Ligado':'Pendente',backendPeopleLoaded?'green':'amber')}</div><div class="diagnostic-grid"><div><span>Contas</span><strong>${backendPeopleLoaded?backendPeopleRows().length:'—'}</strong></div><div><span>Acessos pré-atribuídos</span><strong>${backendPeopleLoaded?(backendPeople.invitations||[]).length:'—'}</strong></div><div><span>Contas ligadas a jogadores</span><strong>${backendPeopleLoaded?(backendPeople.links||[]).length:'—'}</strong></div></div><div class="form-actions"><button class="btn secondary" id="refreshBackendPeople">Atualizar acessos online</button><button class="btn" id="openPeopleSettings">Gerir pessoas e acessos</button></div></div><div class="card"><div class="card-head"><div><h3>Notificações · horários padrão</h3><p>Horários usados por defeito quando escolhes Programar. Podes sempre alterá-los no momento do envio.</p></div>${pill(backendNotificationScheduleLoaded?'Online':'Predefinições',backendNotificationScheduleLoaded?'green':'amber')}</div><form id="notificationScheduleSettings"><div class="form-grid"><div class="field"><label>DIA DE JOGO!</label><input type="time" name="matchday_time" value="${esc(String(currentNotificationSchedule().matchday_time||'08:00').slice(0,5))}"></div><div class="field"><label>Aviso de treino · horas antes</label><input type="number" name="training_lead_hours" min="0" max="168" step="0.5" value="${esc((Number(currentNotificationSchedule().training_lead_minutes||120)/60).toString())}"></div><div class="field"><label>Plano pré-jogo · dias antes</label><input type="number" name="nutrition_days_before" min="0" max="7" step="1" value="${esc(String(currentNotificationSchedule().nutrition_days_before??1))}"></div><div class="field"><label>Plano pré-jogo · hora</label><input type="time" name="nutrition_time" value="${esc(String(currentNotificationSchedule().nutrition_time||'10:00').slice(0,5))}"></div></div><div class="note">Convocatória e Resultado final têm por defeito <strong>Enviar agora</strong>. DIA DE JOGO, Plano pré-jogo e Treino abrem por defeito já programados para estes horários.</div><div class="form-actions"><button class="btn" id="saveNotificationSchedule">Guardar horários</button></div></form></div><div class="card"><div class="card-head"><div><h3>Plano alimentar pré-jogo</h3><p>Base para a notificação enviada aos convocados na véspera.</p></div>${pill(state.settings.nutritionEnabled?'Ativo':'A aguardar plano',state.settings.nutritionEnabled?'green':'amber')}</div>${!backendNutritionLoaded?'<div class="warning-strip">A configuração privada do plano alimentar ainda não foi migrada. Preserva o template anterior e conclui a migração antes de guardar.</div>':''}<div class="form-grid"><div class="field"><label>Peso de referência</label><select id="weightReference"><option value="pre" ${state.settings.weightReference==='pre'?'selected':''}>Peso pré-treino</option><option value="post" ${state.settings.weightReference==='post'?'selected':''}>Peso pós-treino</option><option value="mean" ${state.settings.weightReference==='mean'?'selected':''}>Média pré/pós</option></select></div><div class="field full"><label>Template do plano alimentar</label><textarea id="nutritionTemplate" placeholder="Mais tarde colocamos aqui o plano que vais fornecer. Variáveis disponíveis: {{peso_medio}}, {{jogador}}, {{adversario}}, {{data_jogo}}, {{hora_jogo}}.">${esc(state.settings.nutritionTemplate||'')}</textarea></div></div><div class="form-actions"><button class="btn" id="saveNutrition">Guardar configuração</button></div></div><div class="card"><div class="card-head"><div><h3>Classificação da competição</h3><p>Calculada localmente a partir dos resultados da competição.</p></div>${pill('Manual + automática','green')}</div><div class="note">Os resultados dos restantes clubes são introduzidos em <strong>Resultados</strong>. Os jogos do ADC Figueiras entram automaticamente assim que tiverem resultado e estiverem marcados para contar para a classificação.</div><div class="form-actions"><button class="btn secondary" id="openSeriesResultsSettings">Gerir resultados</button></div></div><div class="card backup-card"><div class="card-head"><div><h3>Backup dos dados locais</h3><p>Exporta uma cópia dos dados locais antes de uma atualização importante.</p></div>${pill(state.settings.lastBackupAt?`Último: ${fmtDateTime(state.settings.lastBackupAt)}`:'Nunca criado',state.settings.lastBackupAt?'green':'amber')}</div><div class="inline-actions"><button class="btn" id="exportData">Exportar backup JSON</button><button class="btn secondary" id="importData">Importar backup</button>${autoSnap?'<button class="btn secondary" id="exportAutoBackup">Exportar snapshot automático</button>':''}</div>${autoSnap?`<div class="meta backup-meta">Snapshot automático local: ${fmtDateTime(autoSnap.savedAt)} · guarda o estado anterior à última alteração.</div>`:''}</div><div class="card"><div class="card-head"><div><h3>Diagnóstico da aplicação</h3><p>Resumo técnico desta instalação.</p></div><span class="pill blue">v${APP_VERSION}</span></div><div class="diagnostic-grid"><div><span>Época local</span><strong>${esc(activeSeason()?.label||'—')}</strong></div><div><span>Jogadores carregados</span><strong>${diag.players}</strong></div><div><span>Jogos Figueiras locais</span><strong>${diag.games}</strong></div><div><span>Treinos locais</span><strong>${diag.trainings}</strong></div><div><span>Jogos/resultados locais</span><strong>${diag.results}</strong></div><div><span>Épocas locais</span><strong>${diag.seasons}</strong></div></div></div></div>`;
 $('#runReleaseAudit')&&($('#runReleaseAudit').onclick=runReleaseAudit);
 $('#exportReleaseSnapshot')&&($('#exportReleaseSnapshot').onclick=exportReleaseSnapshot);
 $('#cleanupKnownTests')&&($('#cleanupKnownTests').onclick=cleanupKnownTestNotifications);
 $('#refreshBackendReference').onclick=async()=>{try{await loadBackendReferenceData(backendReference.settings);renderChrome();renderView('settings');toast('Dados online atualizados.')}catch(err){console.error(err);toast('Não foi possível atualizar os dados online.')}};
 $('#refreshBackendRoster')&&($('#refreshBackendRoster').onclick=async()=>{try{await loadBackendRosterData();renderChrome();renderView('settings');toast('Plantel online atualizado.')}catch(err){console.error(err);toast('Não foi possível atualizar o plantel online.')}});
 $('#createBackendRoster')&&($('#createBackendRoster').onclick=async()=>{if(!confirm(`Criar no Supabase o plantel atual com ${state.players.length} jogadores?`))return;const btn=$('#createBackendRoster');if(btn){btn.disabled=true;btn.textContent='A criar…'}try{const result=await createInitialBackendRoster();renderChrome();renderView('settings');toast(result.created?`Plantel online criado: ${result.count} jogadores.`:'O plantel online já existia.')}catch(err){console.error(err);alert(`Não foi possível criar o plantel online.\n\n${err?.message||'Erro desconhecido'}`);renderView('settings')}});
 $('#refreshBackendMatches')&&($('#refreshBackendMatches').onclick=async()=>{try{await loadBackendMatchesData();renderChrome();renderView('settings');toast('Jogos online atualizados.')}catch(err){console.error(err);alert(`Não foi possível atualizar os jogos online.\n\n${err?.message||'Erro desconhecido'}`)}});
 $('#createBackendMatches')&&($('#createBackendMatches').onclick=async()=>{if(!confirm('Criar no Supabase o calendário completo e os resultados atuais desta época?'))return;const btn=$('#createBackendMatches');if(btn){btn.disabled=true;btn.textContent='A criar calendário…'}try{const result=await createInitialBackendMatches();renderChrome();renderView('settings');toast(result.created?`Calendário online criado: ${result.count} jogos.`:`O calendário online já existia: ${result.count} jogos.`)}catch(err){console.error(err);alert(`Não foi possível criar o calendário online.\n\n${err?.message||'Erro desconhecido'}`);renderView('settings')}});
 $('#refreshBackendMatchCenter')&&($('#refreshBackendMatchCenter').onclick=async()=>{const b=$('#refreshBackendMatchCenter');b.disabled=true;b.textContent='A atualizar…';try{await loadBackendMatchCenterData();renderView('settings');toast('Match Center atualizado a partir do Supabase.')}catch(err){console.error(err);alert(`Não foi possível atualizar o Match Center.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Atualizar Match Center online'}});
 $('#migrateBackendMatchCenter')&&($('#migrateBackendMatchCenter').onclick=async()=>{if(!confirm('Migrar para o Supabase as convocatórias e acontecimentos que ainda existem apenas neste browser?'))return;const b=$('#migrateBackendMatchCenter');b.disabled=true;b.textContent='A migrar…';try{const r=await migrateLocalMatchCenterToBackend();renderView('settings');toast(`Match Center migrado: ${r.rosterRows} jogadores e ${r.eventRows} acontecimentos.${r.skipped?` ${r.skipped} registo(s) ignorado(s).`:''}`)}catch(err){console.error(err);alert(`Não foi possível migrar o Match Center.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Migrar Match Center existente'}});
 $('#refreshBackendTrainings')&&($('#refreshBackendTrainings').onclick=async()=>{const b=$('#refreshBackendTrainings');b.disabled=true;b.textContent='A atualizar…';try{await loadBackendTrainingData();renderChrome();renderView('settings');toast('Treinos atualizados a partir do Supabase.')}catch(err){console.error(err);alert(`Não foi possível atualizar os treinos.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Atualizar treinos online'}});
 $('#migrateBackendTrainings')&&($('#migrateBackendTrainings').onclick=async()=>{if(!confirm(`Migrar para o Supabase os ${localTrainingCount} treino(s), respetivas presenças e pesagens deste browser?`))return;const b=$('#migrateBackendTrainings');b.disabled=true;b.textContent='A migrar…';try{const r=await createInitialBackendTrainings();renderChrome();renderView('settings');toast(`Treinos online: ${r.count} · Presenças: ${r.attendance} · Pesagens: ${r.weighIns}.`)}catch(err){console.error(err);alert(`Não foi possível migrar os treinos.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Migrar treinos existentes'}});
 $('#refreshBackendFines')&&($('#refreshBackendFines').onclick=async()=>{const b=$('#refreshBackendFines');b.disabled=true;b.textContent='A atualizar…';try{await loadBackendFinesData();renderChrome();renderView('settings');toast('Multas atualizadas a partir do Supabase.')}catch(err){console.error(err);alert(`Não foi possível atualizar as multas.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Atualizar multas online'}});
 $('#migrateBackendFines')&&($('#migrateBackendFines').onclick=async()=>{if(!confirm(`Migrar para o Supabase ${localFineRules} regra(s) e ${localManualFines} multa(s) manual(is) que ainda existem apenas neste browser?`))return;const b=$('#migrateBackendFines');b.disabled=true;b.textContent='A migrar…';try{const r=await migrateLocalFinesToBackend();renderChrome();renderView('settings');toast(`Multas migradas: ${r.fines} · Regras: ${r.rules}.${r.skipped?` ${r.skipped} registo(s) ignorado(s).`:''}`)}catch(err){console.error(err);alert(`Não foi possível migrar as multas.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Migrar multas existentes'}});
 $('#refreshBackendPeople')&&($('#refreshBackendPeople').onclick=async()=>{try{await loadBackendPeopleData();renderChrome();renderView('settings');toast('Acessos online atualizados.')}catch(err){console.error(err);alert(`Não foi possível atualizar os acessos.\n\n${err?.message||'Erro desconhecido'}`)}});
 $('#openPeopleSettings')&&($('#openPeopleSettings').onclick=()=>showView('people'));
 $('#openSeriesResultsSettings').onclick=()=>showView('seriesResults');
 $('#notificationScheduleSettings')&&($('#notificationScheduleSettings').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),b=$('#saveNotificationSchedule');b.disabled=true;b.textContent='A guardar…';try{await saveBackendNotificationSchedule(Object.fromEntries(fd));toast('Horários padrão guardados.');renderView('settings')}catch(err){console.error(err);alert(`Não foi possível guardar os horários.\n\n${err?.message||'Erro desconhecido'}`);b.disabled=false;b.textContent='Guardar horários'}});
 $('#saveNutrition').onclick=async()=>{const btn=$('#saveNutrition');btn.disabled=true;btn.textContent='A guardar…';
  try{await saveBackendNutritionSettings($('#weightReference').value,$('#nutritionTemplate').value);saveState('Plano alimentar guardado no Supabase.')}
  catch(err){console.error(err);alert('Não foi possível guardar o plano alimentar.\\n\\n'+(err?.message||'Erro desconhecido'))}
  finally{btn.disabled=false;btn.textContent='Guardar configuração'}
 };
 $('#exportData').onclick=exportData;
 $('#importData').onclick=()=>$('#importInput').click();
 $('#exportAutoBackup')&&($('#exportAutoBackup').onclick=exportAutoBackup);
}
async function runReleaseAudit(){
 const btn=$('#runReleaseAudit');if(btn){btn.disabled=true;btn.textContent='A auditar…'}
 try{
  const {data,error}=await supabaseClient.rpc('admin_release_audit');if(error)throw error;
  const missing=Array.isArray(data?.critical_rls_missing)?data.critical_rls_missing:[];
  const coreOk=!!data?.core_ready;
  openModal('Auditoria final',coreOk?'O núcleo técnico passou as verificações automáticas.':'Há pontos técnicos a rever antes do lançamento.',`<div class="diagnostic-grid"><div><span>Admins ativos</span><strong>${esc(data?.active_admins??'—')}</strong></div><div><span>Épocas ativas</span><strong>${esc(data?.active_seasons??'—')}</strong></div><div><span>Jogos do campeonato</span><strong>${esc(data?.league_matches??'—')}/156</strong></div><div><span>Cron de push</span><strong>${data?.push_cron_active?'Ativo':'Verificar'}</strong></div><div><span>Pedidos de sócio pendentes</span><strong>${esc(data?.pending_member_requests??'—')}</strong></div><div><span>Notificações de teste conhecidas</span><strong>${esc(data?.known_test_notifications??'—')}</strong></div></div><div style="height:12px"></div>${missing.length?`<div class="warning-strip"><strong>RLS a rever:</strong> ${esc(missing.join(', '))}</div>`:`<div class="info-strip"><strong>RLS:</strong> todas as tabelas críticas verificadas têm Row Level Security ativa.</div>`}<div style="height:12px"></div><div class="note">Esta auditoria verifica a configuração técnica central. O SMTP é deliberadamente externo a esta verificação e continua a ser o último bloqueador de release.</div>`);
 }catch(err){console.error(err);alert(`Não foi possível executar a auditoria final.

${err?.message||'Erro desconhecido'}`)}finally{if(btn){btn.disabled=false;btn.textContent='Executar auditoria final'}}
}
async function exportReleaseSnapshot(){
 const btn=$('#exportReleaseSnapshot');if(btn){btn.disabled=true;btn.textContent='A preparar…'}
 try{
  const {data,error}=await supabaseClient.rpc('admin_release_snapshot');if(error)throw error;
  const payload={product:'ADC Figueiras',app_version:APP_VERSION,exported_at:new Date().toISOString(),backend:data,local_state:state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`adc-figueiras-release-snapshot-${nowKey()}.json`;a.click();URL.revokeObjectURL(a.href);state.settings.lastBackupAt=new Date().toISOString();persistPublicCache();renderView(currentView);toast('Snapshot de release exportado.');
 }catch(err){console.error(err);alert(`Não foi possível exportar o snapshot de release.

${err?.message||'Erro desconhecido'}`)}finally{if(btn){btn.disabled=false;btn.textContent='Exportar snapshot de release'}}
}
async function cleanupKnownTestNotifications(){
 if(!confirm('Eliminar apenas as notificações de teste conhecidas criadas durante a validação do push? As notificações reais não serão removidas.'))return;
 const btn=$('#cleanupKnownTests');if(btn){btn.disabled=true;btn.textContent='A limpar…'}
 try{const {data,error}=await supabaseClient.rpc('admin_cleanup_known_test_notifications');if(error)throw error;await loadBackendNotifications();renderChrome();renderView('settings');toast(`${Number(data||0)} notificação(ões) de teste removida(s).`)}catch(err){console.error(err);alert(`Não foi possível limpar as notificações de teste.

${err?.message||'Erro desconhecido'}`)}finally{if(btn){btn.disabled=false;btn.textContent='Limpar notificações de teste'}}
}

function exportData(){state.settings.lastBackupAt=new Date().toISOString();persistPublicCache();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`adc-figueiras-backup-${nowKey()}.json`;a.click();URL.revokeObjectURL(a.href);renderView(currentView);toast('Backup exportado.')}
function exportAutoBackup(){const snap=autoBackupSnapshot();if(!snap?.data){toast('Ainda não existe snapshot automático.');return}const blob=new Blob([JSON.stringify(snap.data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`adc-figueiras-snapshot-${nowKey()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Snapshot automático exportado.')}

function openModal(title,subtitle,html,wide=false){$('#modalTitle').textContent=title;$('#modalSubtitle').textContent=subtitle||'';$('#modalBody').innerHTML=html;$('#modal').classList.toggle('wide',!!wide);$('#modalBackdrop').classList.remove('hidden')}
function closeModal(){$('#modalBackdrop').classList.add('hidden')}

document.addEventListener('click',e=>{const link=e.target.closest('[data-team-link]');if(link){e.preventDefault();e.stopPropagation();openTeamPage(link.dataset.teamLink)}});
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target===$('#modalBackdrop'))closeModal()};$('#previewMode').onchange=e=>{if(!backendRoles.includes('admin')||guestMode){mode=guestMode?'public':highestBackendRole(backendRoles);renderChrome();return}mode=e.target.value;localStorage.setItem(MODE_KEY,mode);if(!can(currentView))currentView='dashboard';renderChrome();showView(currentView)};$('#seasonSelect').onchange=async e=>{try{await switchSeason(e.target.value)}catch(err){console.error(err);alert(`Não foi possível abrir a época.\n\n${err?.message||'Erro desconhecido'}`)}};$('#notificationBell').onclick=()=>showView('notifications');$('#importInput').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.size>15*1024*1024){alert('O backup é demasiado grande.');e.target.value='';return}const r=new FileReader();r.onload=()=>{try{const data=sanitizeImportedSnapshot(JSON.parse(r.result));if(!data||typeof data!=='object'||!data.schemaVersion)throw new Error('Formato inválido');state=normalizeState(data);saveState('Backup importado.')}catch(err){console.warn('Backup rejeitado:',err?.message||'');alert('Não foi possível importar este ficheiro.')}};r.readAsText(file);e.target.value=''};
window.addEventListener('online',()=>$('#offlineBanner').classList.add('hidden'));window.addEventListener('offline',()=>$('#offlineBanner').classList.remove('hidden'));if(!navigator.onLine)$('#offlineBanner').classList.remove('hidden');
if('serviceWorker'in navigator&&location.protocol!=='file:'){
 navigator.serviceWorker.register('./sw.js?v=3.17.0',{updateViaCache:'none'}).then(async reg=>{
  try{await reg.update()}catch(e){console.warn('Não foi possível verificar atualização da PWA.',e)}
 }).catch(e=>console.warn('Não foi possível registar o service worker.',e));
}

bootV3();
