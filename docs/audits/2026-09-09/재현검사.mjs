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
function load(rel,mocks={},cache=new Map()) {
 const full=path.resolve(root,rel);
 if(cache.has(full))return cache.get(full).exports;
 const module={exports:{}};cache.set(full,module);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
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
 vm.runInNewContext(code,{module,exports:module.exports,require:req,console:quiet,Date,Map,Set,Intl,URL,DOMException,setTimeout,clearTimeout},{filename:full});
 return module.exports;
}
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
record('CHAT-01',{observed:rooms.length===0&&selected===null,scenario:'429 방 목록 조회 실패',roomCount:rooms.length,selectedRoom:selected});
await hook.updateUnreadForRooms([{id:'room-b',members:['me','peer'],created_at:'2026-09-09 00:00:00'}]);
record('CHAT-02',{observed:counts['room-b']===0,scenario:'닫힌 방 새 미읽음 3건, 이전 값 0',expected:3,actual:counts['room-b']});
const errorBoundary=load('app/components/ErrorBoundary.tsx',{'react':require('react'),'react/jsx-runtime':require('react/jsx-runtime')});
// 같은 구현을 브라우저 전역을 제공한 별도 컨텍스트에서 평가한다.
const ebCode=ts.transpileModule(fs.readFileSync('app/components/ErrorBoundary.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const storage=new Map();let reloads=0;
const ebModule={exports:{}};
vm.runInNewContext(ebCode,{module:ebModule,exports:ebModule.exports,require,console:quiet,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{location:{href:'http://test/',reload:()=>reloads++}},navigator:{userAgent:'audit'},fetch:()=>Promise.resolve(),Date});
for(let i=0;i<2;i++){const b=new ebModule.exports.default({children:null});b.setState=()=>{};b.componentDidMount();b.componentDidCatch(new Error('Loading chunk 123 failed'),{componentStack:''});}
record('CORE-01',{observed:reloads===2,scenario:'재마운트 후 반복 ChunkLoadError',expectedMaximumReloads:1,actualReloads:reloads});
const leave=load('app/main/기능부품/인사관리워크센터/LeaveWorkcenter/data.ts',{
react,'@/lib/db-client':{db:queryMock({data:null,error:{message:'HTTP 500'}})},
'@/lib/approval-submit-payload':blank
});
const leaveResult=await leave.fetchLeaveData({staffs:[{id:'synthetic-staff',name:'테스트',company:'테스트',hire_date:'2024-01-01',status:'재직'}],selectedCo:'테스트'});
record('HR-01',{observed:leaveResult.rows[0].remaining===0,scenario:'연차 관련 조회 4개 모두 500',returnedAsSuccess:true,remaining:leaveResult.rows[0].remaining});
// 원본의 SQL 쿼리 생성/자동 청킹 함수를 추출하여 임시 메모리 DB에서 실행.
const sf=ts.createSourceFile('query.ts',fs.readFileSync('app/api/d1/query/route.ts','utf8'),ts.ScriptTarget.Latest,true);
function findFunction(name){let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,visit);}visit(sf);if(!found)throw Error(name);return found.getText(sf);}
const Database=require('better-sqlite3');const memory=new Database(':memory:');
memory.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, created_at TEXT);');
const insert=memory.prepare('INSERT INTO items VALUES (?,?)');for(let i=1;i<=105;i++)insert.run(i,'2026-09-09 00:00:00');
const {sql}=require('drizzle-orm');const {SQLiteSyncDialect}=require('drizzle-orm/sqlite-core');const dialect=new SQLiteSyncDialect();
const sqlContext={sql,normalizeBindValue:v=>v,buildOrFilterParts:()=>[],buildWhereSql:where=>(where||[]).map(w=>w.op==='in'?sql`${sql.identifier(w.field)} IN (${sql.join(w.value.map(v=>sql`${v}`),sql`, `)})`:sql`${sql.identifier(w.field)} = ${w.value}`),D1_MAX_PARAMS:100,db:{run:async s=>{const q=dialect.sqlToQuery(s);return {results:memory.prepare(q.sql).all(...q.params)}}}};
vm.createContext(sqlContext);
vm.runInContext(ts.transpileModule([findFunction('buildSelectSql'),findFunction('countBindParams'),findFunction('executeWithAutoChunk')].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,sqlContext);
const chunked=await sqlContext.executeWithAutoChunk({table:'items',where:[{field:'id',op:'in',value:Array.from({length:105},(_,i)=>i+1)}],order:[{field:'id',ascending:false}],limit:2});
record('CORE-02',{observed:chunked.length!==2,scenario:'IN 105개 + 내림차순 LIMIT 2',expectedIds:[105,104],actualIds:chunked.map(r=>r.id)});
const firstPage=memory.prepare('SELECT * FROM items ORDER BY created_at DESC,id DESC LIMIT 21').all();
const cursor=firstPage.slice(0,20).at(-1).created_at;
const nextPage=memory.prepare('SELECT * FROM items WHERE created_at < ? ORDER BY created_at DESC,id DESC LIMIT 21').all(cursor);
record('CHAT-03',{observed:nextPage.length===0,scenario:'원본 fetchMessagePage와 동일 SQL, 같은 초 105건',total:105,firstPage:20,nextPage:nextPage.length,unreachable:85});
memory.close();
// 전체 앱·라이브러리 파일 및 명시적 SELECT의 스키마 일치성 목록.
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):/\.(tsx?|m?js)$/.test(e.name)?[path.join(dir,e.name)]:[]);}
const files=[...walk('app'),...walk('lib'),...walk('electron-app').filter(p=>!p.includes('node_modules'))];
const schemaSf=ts.createSourceFile('schema.ts',fs.readFileSync('lib/db/schema.ts','utf8'),ts.ScriptTarget.Latest,true);
const schema=new Map();
function sv(n){if(ts.isCallExpression(n)&&n.expression.getText(schemaSf)==='sqliteTable'&&ts.isStringLiteral(n.arguments[0])&&ts.isObjectLiteralExpression(n.arguments[1]))schema.set(n.arguments[0].text,new Set(n.arguments[1].properties.map(p=>p.name?.getText(schemaSf).replaceAll('"',''))));ts.forEachChild(n,sv);}sv(schemaSf);
const mismatches=[];
for(const file of files){const text=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='select'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){const prefix=n.expression.expression.getText(ast);const match=prefix.match(/\.from\(['"]([^'"]+)['"]\)/);if(match&&schema.has(match[1])){const cols=n.arguments[0].text.split(',').map(x=>x.trim());const missing=cols.filter(c=>c!=='*'&&!schema.get(match[1]).has(c));if(missing.length)mismatches.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,table:match[1],missing});}}ts.forEachChild(n,visit);}visit(ast);}
const lint=JSON.parse(fs.readFileSync('.scratch-r/audit-eslint-20260909.json','utf8'));
const appLint=lint.filter(r=>/[/\\](app|lib)[/\\]/.test(r.filePath));
const inventory={sourceFiles:files.length,apiRoutes:files.filter(p=>p.startsWith(path.join('app','api'))&&p.endsWith('route.ts')).length,schemaTables:schema.size,explicitSelectMismatches:mismatches,eslint:{files:lint.length,errors:lint.reduce((s,r)=>s+r.errorCount,0),warnings:lint.reduce((s,r)=>s+r.warningCount,0),appErrors:appLint.reduce((s,r)=>s+r.errorCount,0),appWarnings:appLint.reduce((s,r)=>s+r.warningCount,0)}};
fs.writeFileSync('.scratch-r/audit-20260909-results.json',JSON.stringify({results,inventory},null,2));
console.log(JSON.stringify({inventory:{...inventory,explicitSelectMismatches:mismatches.length}}));
const policies=load('lib/db/auth/policies.ts');
const claims={erp_staff_id:'audit-user',erp_company_name:'A',erp_is_admin:false,erp_can_manage_company:false};
const foreignPin={id:'synthetic-pin',room_id:'foreign-private-room',message_id:'synthetic-private-message',user_id:'other-user'};
const visiblePins=await policies.filterByPolicy({},claims,'pinned_messages',[foreignPin]);
let pinWriteAllowed=false;
try {await policies.assertAccess({db:{},claims,table:'pinned_messages',op:'insert',row:foreignPin});pinWriteAllowed=true;}catch{}
record('SEC-01',{observed:visiblePins.length===1&&pinWriteAllowed,scenario:'비관리자·타사 비공개방 고정 메타데이터 정책 호출',visiblePins:visiblePins.length,pinWriteAllowed});
const localDb=new Database('data/allerp.sqlite',{readonly:true,fileMustExist:true});
const dbStats={quickCheck:localDb.pragma('quick_check'),messageCount:localDb.prepare('SELECT count(*) n FROM messages').get().n,staffCount:localDb.prepare('SELECT count(*) n FROM staff_members').get().n,timestamps:localDb.prepare("SELECT CASE WHEN substr(created_at,11,1)='T' THEN 'ISO' WHEN substr(created_at,11,1)=' ' THEN 'SQL' ELSE 'other' END format,count(*) n FROM messages GROUP BY format").all(),sameTimestampLargeGroups:localDb.prepare('SELECT count(*) n FROM (SELECT room_id,created_at FROM messages GROUP BY room_id,created_at HAVING count(*)>20)').get().n};
localDb.close();
record('LOCAL-DB',{readOnly:true,...dbStats});
const serverText=fs.readFileSync('server.mjs','utf8');
const scheduled=[...serverText.matchAll(/['"]\/api\/cron\/([^'"]+)['"]/g)].map(m=>m[1]);
const cronRoutes=fs.readdirSync('app/api/cron');
const cronMissing=cronRoutes.filter(x=>!scheduled.includes(x));
record('OPS-01',{cronRoutes:cronRoutes.length,scheduled:scheduled.length,missing:cronMissing});
fs.writeFileSync('.scratch-r/audit-20260909-results.json',JSON.stringify({results,inventory},null,2));
const foreignPension={id:'synthetic-pension',staff_id:'other-staff',account_number:'SYNTHETIC-ONLY',monthly_contribution:100};
const pensionVisible=await policies.filterByPolicy({},claims,'retirement_pensions',[foreignPension]);
record('SEC-02',{observed:pensionVisible.length===1,scenario:'일반 직원의 타인 퇴직연금 행 열람 정책',visibleRows:pensionVisible.length});
const manager={...claims,erp_can_manage_company:true};
const foreignPayroll={id:'synthetic-payroll',staff_id:'other-company-staff',year_month:'2026-09',net_pay:1};
const payrollWrite=await policies.canAccess({db:{},claims:manager,table:'payroll_records',op:'update',row:foreignPayroll,guardRow:{...foreignPayroll,net_pay:2},changedKeys:new Set(['net_pay'])});
record('SEC-03',{observed:payrollWrite,scenario:'회사 A 관리자 권한으로 다른 직원 급여 수정 정책, 회사 조회 없이 통과',allowed:payrollWrite});
const localRead=new Database('data/allerp.sqlite',{readonly:true,fileMustExist:true});
const mixedOrder=localRead.prepare(`WITH ranked AS (SELECT room_id,created_at,row_number() OVER (PARTITION BY room_id,substr(created_at,1,10) ORDER BY created_at DESC,id DESC) raw_pos,row_number() OVER (PARTITION BY room_id,substr(created_at,1,10) ORDER BY julianday(created_at) DESC,id DESC) time_pos FROM messages) SELECT count(*) n FROM ranked WHERE raw_pos=1 AND time_pos>1`).get().n;
localRead.close();
record('CHAT-04',{readOnly:true,scenario:'로컬 DB 방·날짜별 문자열 최신행과 실제 시각 최신행 불일치',affectedRoomDays:mixedOrder});
fs.writeFileSync('.scratch-r/audit-20260909-results.json',JSON.stringify({results,inventory},null,2));
const http=await import('node:http');
const {chromium}=require('@playwright/test');
const configText=fs.readFileSync('next.config.ts','utf8');
const header=configText.match(/key: 'Permissions-Policy',\s*value: '([^']+)'/)[1];
const auditServer=http.createServer((req,res)=>{res.setHeader('Permissions-Policy',header);res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local permission audit</title>');});
let browser;
try {
 await new Promise(resolve=>auditServer.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+auditServer.address().port);
 const permission=await page.evaluate(async()=>{let failure=null;try{const stream=await navigator.mediaDevices.getUserMedia({video:true});stream.getTracks().forEach(t=>t.stop());}catch(e){failure=e.name;}return {cameraAllowed:document.featurePolicy?.allowsFeature('camera'),failure};});
 record('HR-02',{observed:permission.cameraAllowed===false,...permission,scenario:'next.config 원본 헤더를 적용한 로컬 Chromium 카메라 요청'});
} catch(e){record('HR-02',{testBlocked:true,error:e.message});}
finally {if(browser)await browser.close();await new Promise(resolve=>auditServer.close(resolve));}
fs.writeFileSync('.scratch-r/audit-20260909-results.json',JSON.stringify({results,inventory},null,2));
