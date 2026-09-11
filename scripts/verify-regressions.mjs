import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=process.cwd();
const results=[];
const record=(id,detail)=>{results.push({id,...detail});console.log(JSON.stringify({id,...detail}));};
const quiet={...console,error(){},warn(){}};
function load(rel,mocks={},cache=new Map(), extra="") {
 const full=path.resolve(root,rel);
 if(cache.has(full))return cache.get(full).exports;
 const loadedModule={exports:{}};cache.set(full,loadedModule);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const req=(id)=>{
  if(id in mocks)return mocks[id];
  if(id==='server-only')return {};
  if(id.startsWith('.')||id.startsWith('@/')){
   const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(full),id);
   const target=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts'),path.join(base,'index.tsx')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
   if(!target)throw Error('Missing module '+id);return load(target,mocks,cache);
  }
  return require(id);
 };
 vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,require:req,console:{...quiet,log(){}},process,Buffer,__dirname:path.dirname(full),Date,Error,Map,Set,Intl,URL,Request,Response,DOMException,setTimeout,clearTimeout},{filename:full});
 return loadedModule.exports;
}
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {sql}=require('drizzle-orm');
const {SQLiteSyncDialect}=require('drizzle-orm/sqlite-core');
const dialect=new SQLiteSyncDialect();
const memory=new Database(':memory:');
const {runAutoMigration}=load('lib/db/auto-migrate.ts');
assert.equal(runAutoMigration(memory).success,true);
assert.equal(runAutoMigration(memory).applied.length,0);
const {SqliteD1Adapter}=load('lib/db/client-sqlite.ts');
const adapter=new SqliteD1Adapter(memory);
const db=require('drizzle-orm/d1').drizzle(adapter);
const policies=load('lib/db/auth/policies.ts');
const mocks={'@/lib/server-session':{readSessionFromRequest:async()=>({user:{id:'me'}})},'@/lib/db':{...policies,getD1Binding:async()=>adapter,getD1Drizzle:()=>db},'@/lib/rate-limit':{consumeRateLimit:async()=>({allowed:true})}};
const {buildSelectSql}=load('app/api/d1/query/route.ts',mocks,new Map(),'\nexport {buildSelectSql};');
const query=payload=>{const s=dialect.sqlToQuery(buildSelectSql(payload));return memory.prepare(s.sql).all(...s.params);};
const {messageCursorFilter}=load('lib/chat-message-cursor.ts');
memory.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY); INSERT INTO staff_members(id,employee_no,name,company) VALUES('me','TEST-ME','테스트 본인','A'),('peer','TEST-PEER','테스트 동료','A'),('other','TEST-OTHER','테스트 타사','B');`);
for(let id=1;id<=105;id++)memory.prepare('INSERT INTO items VALUES(?)').run(id);
assert.deepEqual(query({table:'items',where:[{field:'id',op:'in',value:Array.from({length:105},(_,i)=>i+1)}],order:[{field:'id',ascending:false}],limit:2}).map(r=>r.id),[105,104]);
record('CORE-11',{passed:true,scenario:'105개 IN 조건에도 정렬 및 LIMIT은 전체 결과에 한 번 적용'});
memory.prepare('INSERT INTO chat_rooms(id,name,members) VALUES(?,?,?)').run('room','테스트방',JSON.stringify(['me','peer']));
memory.prepare('INSERT INTO chat_rooms(id,name,members) VALUES(?,?,?)').run('foreign','타사방',JSON.stringify(['other']));
for(let i=1;i<=105;i++)memory.prepare('INSERT INTO messages(id,room_id,sender_id,content,created_at) VALUES(?,?,?,?,?)').run(String(i).padStart(3,'0'),'room','me','합성 메시지',i%2?'2026-09-09T01:00:00.000Z':'2026-09-09 01:00:00');
memory.prepare('INSERT INTO messages(id,room_id,sender_id,content,created_at) VALUES(?,?,?,?,?)').run('106','room','me','나중 메시지','2026-09-09 02:00:00');
const all=[];let cursor=null;
do {const page=query({table:'messages',where:[{field:'room_id',op:'eq',value:'room'}],orFilters:cursor?[messageCursorFilter(cursor.created_at,cursor.id,'lt')]:[],order:[{field:'created_at',ascending:false},{field:'id',ascending:false}],limit:20});if(!page.length)break;all.push(...page);cursor=page.at(-1);}while(true);
assert.equal(all.length,106);assert.equal(new Set(all.map(r=>r.id)).size,106);assert.equal(all[0].id,'106');
record('CHAT-02-03',{passed:true,scenario:'ISO/SQL 시각 혼합 및 같은 시각 105건을 중복·누락 없이 페이지 조회'});
await assert.rejects(adapter.batch([adapter.prepare('INSERT INTO items VALUES(106)'),adapter.prepare('INSERT INTO items VALUES(105)')]));
assert.equal(memory.prepare('SELECT count(*) n FROM items WHERE id=106').get().n,0);
record('CORE-12',{passed:true,scenario:'두 번째 저장 실패 시 첫 번째 저장도 롤백'});
memory.exec(`INSERT INTO payroll_records(id,staff_id,year_month) VALUES('pay-a','me','2026-09'),('pay-b','other','2026-09'); INSERT INTO payroll_locks(id,year_month,company_name) VALUES('lock-a','2026-09','A');`);
for(const command of ["INSERT INTO payroll_records(id,staff_id,year_month) VALUES('pay-new','me','2026-09')","UPDATE payroll_records SET net_pay=1 WHERE id='pay-a'","DELETE FROM payroll_records WHERE id='pay-a'","UPDATE payroll_records SET staff_id='other',year_month='2026-10' WHERE id='pay-a'","UPDATE payroll_records SET staff_id='me' WHERE id='pay-b'"])assert.throws(()=>memory.exec(command),/PAYROLL_MONTH_LOCKED/);
memory.exec("UPDATE payroll_records SET net_pay=12 WHERE id='pay-b'");
memory.exec("INSERT INTO payroll_locks(id,year_month,company_name) VALUES('lock-all','2026-09','전체')");
assert.throws(()=>memory.exec("UPDATE payroll_records SET net_pay=13 WHERE id='pay-b'"),/PAYROLL_MONTH_LOCKED/);
record('PAYROLL-16',{passed:true,scenario:'회사·전체 마감 시 생성/수정/삭제/소속변경 차단, 타사 미마감 저장 허용'});
const member={erp_staff_id:'me',erp_company_name:'A',erp_is_admin:false,erp_can_manage_company:false};
const manager={...member,erp_can_manage_company:true};
await policies.assertAccess({db,claims:manager,table:'payroll_records',op:'insert',row:{staff_id:'peer'}});
await assert.rejects(policies.assertAccess({db,claims:manager,table:'payroll_records',op:'insert',row:{staff_id:'other'}}));
assert.equal((await policies.filterByPolicy(db,member,'retirement_pensions',[{staff_id:'other'}])).length,0);
for(const table of ['pinned_messages','message_reactions']) {
 const own={id:'pin',room_id:'room',message_id:'001',user_id:'me'};
 assert.equal((await policies.filterByPolicy(db,member,table,[own])).length,1);
 await assert.rejects(policies.assertAccess({db,claims:member,table,op:'insert',row:{...own,room_id:'foreign'}}));
}
await assert.rejects(policies.assertAccess({db,claims:member,table:'room_read_cursors',op:'insert',row:{user_id:'me',room_id:'foreign'}}));
record('SEC-08-10',{passed:true,scenario:'타사 급여·연금 및 비참여 대화방 메타데이터 차단'});
function queryMock(response) { return {from(table){const q=new Proxy({}, {get(_,key){if(key==='then')return (yes,no)=>Promise.resolve(typeof response==='function'?response(table):response).then(yes,no);return ()=>q;}});return q;}}; }
const react={useCallback:f=>f,useRef:v=>({current:v}),useState:v=>[v,()=>{}],useMemo:f=>f(),useEffect:()=>{}};
const blank=new Proxy({}, {get:()=>()=>{}});
let rooms=[{id:'room-a',members:['me']}], selected='room-a', counts={'room-b':0};
const utils={NOTICE_ROOM_ID:'notice',normalizeMemberIds:v=>v||[],sortChatRoomsWithNoticeFirst:v=>v,getConversationRoomIdSet:id=>new Set([id]),getDirectRoomMembersKey:()=>null,toChatDate:v=>new Date(v)};
const chat=load('app/main/기능부품/메신저방데이터훅.ts',{
 react,'@/lib/db-client':{db:queryMock({data:[],error:null})},
 './메신저유틸':utils,'./메신저첨부':blank,'./메신저방데이터-types':{MESSAGE_PAGE_SIZE:20},
 './메신저방데이터-utils':blank,'./메신저방데이터-queries':blank,'@/lib/chat-query-columns':{},'@/lib/chat-room-summary':{},
 './chatQueryService':{fetchAllChatRooms:async()=>({data:null,error:{message:'HTTP 429'}})},
 './메신저데이터유틸':{fetchUnreadCountsForRoomIds:async()=>({'room-b':3})}
});
const ref=v=>({current:v});const noop=()=>{};
const params={selectedRoomId:'room-a',selectedRoomIdRef:ref('room-a'),chatRoomsRef:ref(rooms),messagesRef:ref([]),pendingBottomAlignRoomIdRef:ref(null),fetchDataRequestSeqRef:ref(0),deliveryStatesRef:ref({}),effectiveChatUserId:'me',effectiveTodoUserId:'me',userId:'me',setRoom:v=>selected=v,isRoomAccessibleToCurrentUser:()=>true,repairDirectRooms:async v=>v,setChatRooms:v=>rooms=typeof v==='function'?v(rooms):v,setRoomUnreadCounts:v=>counts=typeof v==='function'?v(counts):v};
for(const k of ['setMessages','setLoadingRoomId','setTimelineRoomId','setRoomReadCursorMap','setReadCounts','setBookmarkedIds','setPinnedIds','setPersistedPinnedMessages','setReactions','setReactionUsersByMessage','setPolls','setPollVotes'])params[k]=noop;
const hook=chat.useChatRoomDataSync(params);
await hook.fetchData();
assert.equal(rooms.length,1);assert.equal(selected,'room-a');
record('CHAT-01',{passed:true,scenario:'방 목록 429 오류에도 선택된 방과 목록 유지'});
await hook.updateUnreadForRooms([{id:'room-b',members:['me','peer'],created_at:'2026-09-09 00:00:00'}]);
assert.equal(counts['room-b'],3);
record('CHAT-04',{passed:true,scenario:'닫힌 방의 미읽음 0에서 3으로 갱신'});
const leave=load('app/main/기능부품/인사관리워크센터/LeaveWorkcenter/data.ts',{
react,'@/lib/db-client':{db:queryMock({data:null,error:{message:'HTTP 500'}})},
'@/lib/approval-submit-payload':blank
});
await assert.rejects(leave.fetchLeaveData({staffs:[{id:'synthetic-staff',name:'테스트',company:'테스트',hire_date:'2024-01-01',status:'재직'}],selectedCo:'테스트'}));
record('HR-06',{passed:true,scenario:'연차 조회 500을 잔여 0일 정상 응답으로 처리하지 않음'});

const guardCode=ts.transpileModule(fs.readFileSync('lib/stale-build-guard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const storage=new Map();let reloads=0;const guardModule={exports:{}};
vm.runInNewContext(guardCode,{module:guardModule,exports:guardModule.exports,require:()=>({toast(){}}),Date,window:{sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setTimeout:fn=>fn(),location:{reload:()=>reloads++}}});
guardModule.exports.handleStaleBuild();guardModule.exports.handleStaleBuild();assert.equal(reloads,1);
record('CORE-05',{passed:true,scenario:'청크 오류 연속 발생 시 자동 새로고침 최대 한 번'});


const mutationMocks={...mocks,'@/lib/server-session':{readSessionFromRequest:async()=>({user:{id:'me',role:'admin'}})},'@/lib/realtime/server-signal':{emitRealtimeSignal:async()=>{}}};
const mutate=load('app/api/d1/mutate/route.ts',mutationMocks).POST;
const send=body=>mutate(new Request('http://isolated/api/d1/mutate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
const lockedResponse=await send({table:'payroll_records',op:'update',set:{net_pay:999},where:[{field:'id',op:'eq',value:'pay-a'}]});
assert.equal(lockedResponse.status,409,await lockedResponse.text());
const pensionRows=Array.from({length:30},(_,i)=>({id:'batch-'+(i===29?0:i),staff_id:'batch-staff-'+i,created_at:'2026-09-09T00:00:00.000Z',updated_at:'2026-09-09T00:00:00.000Z'}));
const failedBatch=await send({table:'retirement_pensions',op:'insert',values:pensionRows});
const batchFailure=await failedBatch.text();
assert.equal(failedBatch.status,500,batchFailure);
assert.match(batchFailure,/UNIQUE constraint failed/);
const validBatch=await send({table:'retirement_pensions',op:'insert',values:pensionRows.map((row,i)=>({...row,id:'valid-'+i}))});
assert.equal(validBatch.status,200,await validBatch.text());
assert.equal(memory.prepare("SELECT count(*) n FROM retirement_pensions WHERE id LIKE 'valid-%'").get().n,30);
assert.equal(memory.prepare("SELECT count(*) n FROM retirement_pensions WHERE id LIKE 'batch-%'").get().n,0);
record('API-12-16',{passed:true,scenario:'실제 저장 라우트에서 마감 변경 409 및 다중 청크 삽입 실패 전체 롤백'});

memory.exec("INSERT INTO retirement_pensions(id,staff_id) VALUES('own-pension','me'),('other-pension','other')");
const queryRoute=load('app/api/d1/query/route.ts',mocks).POST;
const projectionResponse=await queryRoute(new Request('http://isolated/api/d1/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({table:'retirement_pensions',columns:['id'],where:[{field:'id',op:'in',value:['own-pension','other-pension']}]})}));
assert.equal(projectionResponse.status,200);
assert.deepEqual((await projectionResponse.json()).data,[{id:'own-pension'}]);
record('API-08',{passed:true,scenario:'소유자 컬럼을 요청하지 않아도 본인 자료만 반환하고 요청한 컬럼만 노출'});

// 훅 생명주기를 모사해 실패 시 보존 및 늦은 응답의 범위 격리를 검사합니다.
const slots=[];let hookIndex=0;let effects=[];
const hookReact={
 useRef:value=>{const i=hookIndex++;return slots[i]??(slots[i]={current:value});},
 useState:value=>{const i=hookIndex++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
 useCallback:fn=>fn,
 useEffect:(fn,deps)=>{const i=hookIndex++;const prev=slots[i];if(!prev||deps.some((v,n)=>!Object.is(v,prev.deps[n])))effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
};
const {useHrQuery}=load('lib/use-hr-query.ts',{react:hookReact,'./toast':{toast(){}}});
let key='A';let loader=async()=>['A 자료'];
const HrHarness=()=>{hookIndex=0;const result=useHrQuery(key,loader,[]);const queue=effects;effects=[];queue.forEach(fn=>fn());return result;};
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
HrHarness();await flush();let hr=HrHarness();assert.deepEqual(hr.data,['A 자료']);
loader=async()=>{throw Error('HTTP 500');};hr.reload();HrHarness();await flush();hr=HrHarness();assert.deepEqual(hr.data,['A 자료']);assert.ok(hr.error);
let resolveOld;loader=()=>new Promise(resolve=>{resolveOld=resolve;});hr.reload();HrHarness();
key='B';loader=async()=>['B 자료'];const switched=HrHarness();assert.equal(switched.data.length,0);await flush();resolveOld(['늦은 A 자료']);await flush();hr=HrHarness();assert.deepEqual(hr.data,['B 자료']);
record('HR-07',{passed:true,scenario:'인사 재조회 실패 시 성공값 유지, 회사 변경 시 이전 자료 즉시 숨김 및 늦은 응답 폐기'});
memory.close();
console.log(`회귀 검사 ${results.length}개 그룹 통과 (운영 DB 접근 없음)`);
