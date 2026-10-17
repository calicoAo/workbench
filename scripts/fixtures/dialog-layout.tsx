// Layout acceptance fixture: real public feature UI with isolated read data; no API/DB writes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ApplicationFeedback } from '../../apps/web/src/app/feedback';
import { CalendarFeature } from '../../apps/web/src/features/calendar';
import { SleepFeature } from '../../apps/web/src/features/sleep';
import { CreateTaskWorkflow } from '../../apps/web/src/features/tasks/create-task';
import { EditTaskWorkflow } from '../../apps/web/src/features/tasks/edit-task';
import { CompleteTaskWorkflow } from '../../apps/web/src/features/tasks/complete-task';
import { SelectDailyTasksWorkflow } from '../../apps/web/src/features/tasks/select-daily-tasks';
import { QuickNoteCaptureButton } from '../../apps/web/src/features/quick-notes/capture';
import { QuickNoteDetailPage } from '../../apps/web/src/features/quick-notes/detail';
import { WritingReflectionFeature, WritingReflectionShortcuts } from '../../apps/web/src/features/writing-reflection';
import { DecisionToolsFeature } from '../../apps/web/src/features/decision-tools';
import { FinancePage } from '../../apps/web/src/features/finance';
import { CategorySettings } from '../../apps/web/src/features/categories';
import { RoutinesFeature } from '../../apps/web/src/features/habits';
import { FinishSessionButton } from '../../apps/web/src/features/timer';
import { HeroDailyEntry } from '../../apps/web/src/features/hero';
import { BackpackPage } from '../../apps/web/src/features/backpack';
import { LibraryPage } from '../../apps/web/src/features/library';
import { OnboardingFeature } from '../../apps/web/src/features/onboarding';
import '../../apps/web/src/styles.css';
const date='2026-10-13', noop=()=>{}, scene=new URLSearchParams(location.search).get('scene') ?? 'create';
const category={id:7,name:'编程',dimensionKey:'career',color:'#5B8DEF',enabled:true,version:1,targetMinutes:6000,totalMinutes:120};
const task={id:11,title:'验证弹窗的布局与操作',description:'保持原有任务草稿',status:0,version:1,categoryId:7,projectId:null,difficulty:2,priority:2,estimatedMinutes:30,completionNote:null,createdAt:'2026-10-13T00:00:00Z',dueAt:null};
const hero={businessDate:date,timezone:'Asia/Shanghai',profile:{userId:1,displayName:'Owner',avatarRef:null,portraitRef:null,title:null,birthDate:'2000-01-01',visualPreferences:null,version:1},progress:{level:1,xpTotal:0,coins:0,xpInLevel:0,xpForNextLevel:100},dailyStatus:null,earthOnlineDay:9770};
const bank={id:1,name:'工资卡',type:'BANK',currency:'CNY',includeInOverview:true,openingDate:date,archivedAt:null,version:1,balanceCents:'0'};
const request=async(path,init)=>{
 if(path==='/api/hero/daily-entry/claim')return {claimed:true,hero};
 if(path.startsWith('/api/hero?'))return hero;
 if(path==='/api/onboarding/status')return {eligible:true,flow:{flowId:'core-loop',flowVersion:1,status:'NOT_STARTED',currentStepId:null},hints:[]};
 if(init?.method && init.method!=='GET')throw new Error('Layout acceptance must not write: '+path);
 if(path==='/api/backpack')return {achievements:[],milestones:[{id:1,title:'首个里程碑',description:'阅读详情',happenedOn:date,sourceType:null}],keepsakes:[],summary:{unlockedAchievements:0,totalAchievements:0,milestones:1,keepsakes:0}};
 if(path.startsWith('/api/library'))return {items:[],nextCursor:null,summary:{total:0}};
 if(path.includes('/finance/overview'))return {currency:'CNY',month:'2026-10',recordTimezone:'Asia/Shanghai',totalAssetsCents:'0',totalLiabilitiesCents:'0',netWorthCents:'0',monthlyIncomeCents:'0',monthlyExpenseCents:'0',accountCount:1,accounts:[bank],recentTransactions:[]};
 if(path.includes('/finance/accounts'))return [bank];
 if(path.includes('/finance/categories'))return [{id:1,name:'餐饮',kind:'EXPENSE',enabled:true,version:1,sortOrder:1},{id:2,name:'工资',kind:'INCOME',enabled:true,version:1,sortOrder:2}];
 if(path.includes('/finance/transactions'))return {items:[],nextCursor:null};
 if(path==='/api/quick-notes/1')return {id:1,userId:1,noteDate:date,createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',archivedAt:null,deletedAt:null,tag:null,projectId:null,content:'正文支持 **Markdown**',title:'随手记详情',status:'ACTIVE',version:1,capturedAt:'2026-10-13T00:00:00Z',businessDate:date,recordTimezone:'Asia/Shanghai',tags:[],taskId:null,sourceType:null};
 if(path.includes('/task-categories'))return [category];
 if(path.includes('/projects'))return [];
 if(path.includes('/growth/dimensions'))return {dimensions:[{id:1,dimensionKey:'career',name:'事业',enabled:true,sortOrder:1,color:'#5B8DEF',version:1}],categoryMappings:[]};
 if(path.includes('/habits/summary'))return {items:[],specialized:{water:{cups:0,targetCups:8},morningWriting:{completed:false},sleep:{recorded:false}}};
 return [];
};
const common={request,userId:1,selectedDate:date,timezone:'Asia/Shanghai',onError:console.error,onChanged:noop};
const workflowChildren=(label)=>(open)=><button onClick={()=>open(task)}>{label}</button>;
const scenes={
 timer:<FinishSessionButton session={{id:1,taskId:11,startTime:'2026-10-13T00:00:00Z',durationMinutes:15,status:1,version:1,recordTimezone:'Asia/Shanghai',segments:[{id:1,timerSessionId:1,taskId:11,status:1,startedAt:'2026-10-13T00:00:00Z',endedAt:'2026-10-13T00:15:00Z',businessDate:date}]}} taskVersion={1} commands={{pending:null,finish:async()=>false}} />,
 create:<CreateTaskWorkflow {...common} categories={[category]} projects={[]}>{(open)=><button onClick={()=>open()}>打开</button>}</CreateTaskWorkflow>,
 edit:<EditTaskWorkflow {...common} categories={[category]} projects={[]}>{workflowChildren('打开')}</EditTaskWorkflow>,
 complete:<CompleteTaskWorkflow {...common} taskPlans={[]} activeTaskId={null} onReward={noop}>{workflowChildren('打开')}</CompleteTaskWorkflow>,
 select:<SelectDailyTasksWorkflow {...common} tasks={[task]} categories={[category]} dailyTaskIds={[]} focusTaskIds={[]} onConfirm={noop}>{(open)=><button onClick={open}>打开</button>}</SelectDailyTasksWorkflow>,
 calendar:<CalendarFeature {...common} loading={false} items={[]} tasks={[task]} categories={[category]} initialKind="actual" recordTimezone="Asia/Shanghai" />,
 sleep:<SleepFeature {...common} record={null} snapshotReady initiallyOpen recordTimezone="Asia/Shanghai" />,
 capture:<QuickNoteCaptureButton {...common} label="打开" />,
 notes:<QuickNoteDetailPage {...common} noteId={1} categories={[category]} />,
 writing:<WritingReflectionFeature {...common} initialSnapshot={{morning:null,journal:null,review:null,insights:[]}}><WritingReflectionShortcuts enabledSlots={["MORNING_WRITING","JOURNAL","STOCK_REVIEW"]} /></WritingReflectionFeature>,
 decision:<DecisionToolsFeature {...common} onReward={noop} />,
 finance:<FinancePage {...common} date={date} />,
 categories:<CategorySettings {...common} categories={[category]} />,
 habits:<RoutinesFeature {...common} date={date} categories={[category]} lifeContent={null} />,
 hero:<HeroDailyEntry {...common} businessDate={date} onboardingResolved />,
 backpack:<BackpackPage {...common} />,
 library:<LibraryPage {...common} />,
 onboarding:<OnboardingFeature {...common} tasks={[]} assignments={[]} currentSession={null}><div /></OnboardingFeature>,
 feedback:<ApplicationFeedback>{(actions)=><button onClick={()=>actions.confirm('确认操作','保留原有确认流程',noop)}>打开</button>}</ApplicationFeedback>,
 reward:<ApplicationFeedback>{(actions)=><button onClick={()=>actions.recordReward('日记',{xp:3,coins:2})}>打开</button>}</ApplicationFeedback>
};
const route=scene==='finance'?`/finance?date=${date}&tab=accounts`:scene==='habits'?'/routines?view=habits':scene==='backpack'?'/backpack?view=milestones':'/today';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MemoryRouter initialEntries={[route]}>{scenes[scene]}</MemoryRouter></QueryClientProvider>);
