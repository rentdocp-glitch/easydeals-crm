// Mock supabase-js for smoke tests. Role chosen via localStorage 'mockrole'.
(function(){
  const role = localStorage.getItem('mockrole') || 'admin';
  const ids = {admin:'u-admin', telecaller:'u-tc1', fe:'u-fe1'};
  const uid = ids[role];
  const now = new Date().toISOString(), today = now.slice(0,10);
  const profiles = [
    {id:'u-admin',name:'Admin',role:'admin'},{id:'u-tc1',name:'Priyanka',role:'telecaller'},
    {id:'u-tc2',name:'Padama',role:'telecaller'},{id:'u-fe1',name:'Ashok',role:'fe'},{id:'u-fe2',name:'Atul',role:'fe'}];
  const sts=['new','ringing','callback','followup','prospect','meeting_assigned','meeting_done','online_meet_done','not_interested','not_available','deal_closed'];
  const leads = sts.map((s,i)=>({id:100+i,name:'Owner '+i,phone:'98765432'+String(10+i),phone2:null,property:'Society '+i,price:'85 L',price_l:85,status:s,
    tc_id:'u-tc1',fe_id:'u-fe1',meeting_date:today,meeting_time:'11:00',follow_date:today,follow_time:'10:00',created_at:now,status_at:now,status_by:'u-tc1',
    locality:'Baner',address:'',zone_id:1,area_id:1,bhk:'2',sqft:900,remarks:i%2?'24 Nov · Priyanka: old note':'',dup_of:null,meet_at:now,deal_at:now,tc_at:now,att_at:now}));
  const props=[{id:'ED-001',owner_lead_id:110,owner_name:'Owner 10',owner_phone:'9876543220',project:'Society 10',bhk:'2 BHK',status:'Available - Sale',locality:'Baner',price:'85 L',assignees:[uid],details:{},portal_status:'',created_at:now,updated_at:now,date_added:today},
    {id:'ED-003',owner_name:'Owner L',owner_phone:'9876543299',project:'Locked Society',bhk:'2 BHK',status:'Available - Sale',locality:'Aundh',price:'90 L',assignees:[uid],details:{ai_off:true},portal_status:'',created_at:now,updated_at:now,date_added:today}];
  const buyers=[{id:1,code:'B-1',lead_date:today,property_id:'ED-001',source:'99acres',buyer_name:'Rahul',buyer_phone:'9123456780',status:'New',assignees:[uid],assigned_to:uid,created_at:now,updated_at:now,next_fu:today},
    {id:2,code:'B-2',lead_date:today,property_id:'ED-003',source:'Housing',buyer_name:'Sunita',buyer_phone:'9123456781',status:'New',assignees:[uid],assigned_to:uid,created_at:now,updated_at:now,next_fu:today}];
  const T={profiles,leads,properties:props,buyer_leads:buyers,zones:[{id:1,name:'West',sort:1,active:true}],areas:[{id:1,name:'Baner',norm:'baner',zone_id:1,status:'approved',aliases:[]}],
    calls:[{id:1,lead_id:101,phone:'9876543211',by_id:'u-tc1',duration_sec:65,outcome:'Ringing',created_at:now}],device_calls:[],call_events:[],message_log:[],lead_assignment_log:[],lead_shares:[],dup_requests:[],
    buyer_history:[],invoices:[],team_access:[],assign_rules:[],app_settings:[{k:'zone_ui_team',v:'1'}],wa_settings:[{id:1,enabled:false,daily_cap:50}],wa_messages:[],area_audit:[],
    lead_status_log:[{id:1,lead_id:101,old_status:'new',new_status:'ringing',by_id:'u-tc1',at:now}]};
  window.__calls=[];
  function B(table){
    this.t=table;this.op='select';this._single=false;this._head=false;
  }
  const chain=['select','eq','neq','in','is','gte','lte','gt','lt','ilike','like','or','not','order','limit','range','contains','overlaps','filter','match','textSearch','csv'];
  chain.forEach(m=>B.prototype[m]=function(){ if(m==='select'&&arguments[1]&&arguments[1].head)this._head=true; if(m==='eq'&&arguments[0]==='id'){this._id=arguments[1]} return this; });
  ['insert','update','upsert','delete'].forEach(m=>B.prototype[m]=function(v){this.op=m;this.v=v;window.__calls.push([m,this.t,v]);return this;});
  B.prototype.single=function(){this._single=true;return this};B.prototype.maybeSingle=function(){this._single=true;return this};
  B.prototype.then=function(res,rej){
    let rows=(T[this.t]||[]).slice();if(this._id!==undefined)rows=rows.filter(r=>String(r.id)===String(this._id));
    if(this.t==='profiles'&&this._single) rows=profiles.filter(p=>p.id===uid);
    let data=this._head?null:(this._single?(rows[0]||null):rows);
    if(this.op!=='select'&&this.op) data=this._single?(rows[0]||null):rows.slice(0,1);
    return Promise.resolve({data,error:null,count:rows.length}).then(res,rej);
  };
  const RPC={kpi:[],lead_counts:sts.map(s=>({status:s,n:3})),filt_values:{loc:['Baner'],bhk:['2']},area_lead_counts:[],enq_counts:[],lookup_number:[],wa_sent_today:0,area_unclassified:[],prop_leads:[]};
  function R(name,args){this.name=name;window.__calls.push(['rpc',name,args])}
  chain.concat(['single','maybeSingle']).forEach(m=>R.prototype[m]=function(){return this});
  R.prototype.then=function(res,rej){return Promise.resolve({data:RPC[this.name]!==undefined?RPC[this.name]:null,error:null}).then(res,rej)};
  const user={id:uid,email:role+'@test'};
  const client={from:t=>new B(t),rpc:(n,a)=>new R(n,a),
    auth:{getSession:async()=>({data:{session:{user}}}),signInWithPassword:async()=>({data:{user},error:null}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user}})},
    functions:{invoke:async()=>({data:{ok:false,reason:'mock'},error:null})},
    channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){}};
  window.supabase={createClient:()=>client};
})();
