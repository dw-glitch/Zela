import{parseFile,formatDate,normalize}from'./modules/csv.js';
import{mergeBases,getVisitState,maskId,sortByLongestWithoutVisit}from'./modules/model.js';
import{demoRows}from'./modules/demo.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];

const state={
  territoryBase:null,
  followupBase:null,
  people:[],
  followupOnlyPeople:[],
  stats:null,
  inconsistencies:[],
  visitFilter:'todos',
  conditionFilter:'todos'
};

const importBusy={territory:false,followup:false};

const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[char]));

const formatNumber=value=>new Intl.NumberFormat('pt-BR').format(value||0);
const formatDateSafe=value=>value?formatDate(value):'—';

function todayStart(){
  const now=new Date();
  return new Date(now.getFullYear(),now.getMonth(),now.getDate());
}

function showView(view){
  $$('.view').forEach(element=>element.classList.toggle('active',element.dataset.view===view));
  $$('.nav-item').forEach(element=>element.classList.toggle('active',element.dataset.viewTarget===view));
  window.scrollTo(0,0);
}

function calculateDerived(territoryBase,followupBase){
  if(!territoryBase){
    return{people:[],followupOnlyPeople:[],stats:null,inconsistencies:[]};
  }
  const merged=mergeBases(territoryBase,followupBase,todayStart());
  return{
    people:merged.people,
    followupOnlyPeople:merged.followupOnlyPeople,
    stats:merged.stats,
    inconsistencies:merged.inconsistencies
  };
}

function recalc(){
  Object.assign(state,calculateDerived(state.territoryBase,state.followupBase));
  renderAll();
}

function statusOf(person){
  return getVisitState(person);
}

function renderAll(){
  renderHeader();
  renderMetrics();
  renderFocus();
  renderStreetSummary();
  renderVisitFilters();
  renderVisitList();
  renderPeople();
  renderImportCards();
  renderQuality();
  renderFormatInfo();
}

function renderHeader(){
  const microarea=state.territoryBase?.meta?.microarea;
  $('#microareaLabel').textContent=microarea?'MICROÁREA '+microarea:'MICROÁREA —';

  if(!state.territoryBase){
    $('#dataStatus').textContent='Importe a base de Território e depois a base de Acompanhamentos para montar o painel.';
    return;
  }

  const territory=state.stats?.territoryCount??state.territoryBase.data.length;
  if(!state.followupBase){
    $('#dataStatus').innerHTML='<strong>'+formatNumber(territory)+' pessoas</strong> no Território · aguardando Acompanhamentos para calcular o tempo sem visita.';
    return;
  }

  $('#dataStatus').innerHTML=
    '<strong>'+formatNumber(territory)+' pessoas</strong> no Território · '+
    '<strong>'+formatNumber(state.stats?.matchedCount)+' conciliadas</strong> · '+
    formatNumber(state.stats?.territoryOnly)+' sem acompanhamento localizado.';
}

function metricCard(count,label,filter,kind=''){
  return '<button class="metric-card '+kind+'" type="button" data-visit-filter="'+filter+'">'+
    '<b>'+formatNumber(count)+'</b><span>'+esc(label)+'</span></button>';
}

function renderMetrics(){
  const people=state.people;
  const missing=people.filter(person=>!Number.isFinite(person.daysSinceVisit)).length;
  const d365=people.filter(person=>Number.isFinite(person.daysSinceVisit)&&person.daysSinceVisit>=365).length;
  const d180=people.filter(person=>Number.isFinite(person.daysSinceVisit)&&person.daysSinceVisit>=180&&person.daysSinceVisit<365).length;
  const d90=people.filter(person=>Number.isFinite(person.daysSinceVisit)&&person.daysSinceVisit>=90&&person.daysSinceVisit<180).length;

  $('#visitMetrics').innerHTML=
    metricCard(missing,'Sem visita localizada','sem-visita','due')+
    metricCard(d365,'365+ dias','365+','due')+
    metricCard(d180,'180–364 dias','180-364','soon')+
    metricCard(d90,'90–179 dias','90-179','');
}

function personCard(person){
  const status=statusOf(person);
  const subtitle=[
    person.microarea?'Microárea '+person.microarea:'',
    person.address||''
  ].filter(Boolean).join(' · ')||'Endereço não informado';
  return '<button class="person-card" type="button" data-person="'+esc(person.key)+'">'+
    '<div class="person-main"><h3>'+esc(person.name)+'</h3><p>'+esc(subtitle)+'</p></div>'+
    '<span class="status-pill '+esc(status.key)+'">'+esc(status.label)+'</span>'+
  '</button>';
}

function renderFocus(){
  const wrap=$('#focusList');
  const title=$('#focusTitle');

  if(!state.territoryBase){
    title.textContent='Quem visitar primeiro';
    wrap.innerHTML='<div class="empty-state"><strong>Importe o Território</strong>Depois carregue Acompanhamentos para cruzar as pessoas e calcular o tempo sem visita.</div>';
    return;
  }

  if(!state.followupBase){
    title.textContent='Aguardando Acompanhamentos';
    wrap.innerHTML='<div class="empty-state"><strong>Território carregado</strong>Importe o XLS/XLSX de Acompanhamentos / Condições de saúde / Geral para calcular a última visita.</div>';
    return;
  }

  const sorted=sortByLongestWithoutVisit(state.people);
  title.textContent='Quem está há mais tempo sem visita';
  wrap.innerHTML=sorted.length?sorted.slice(0,8).map(personCard).join(''):
    '<div class="empty-state">Nenhuma pessoa localizada.</div>';
}

function renderStreetSummary(){
  const counts={};
  for(const person of state.people){
    const street=person.street&&person.street!=='-'?person.street:'Sem logradouro';
    counts[street]=(counts[street]||0)+1;
  }
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $('#streetSummary').innerHTML=rows.length?rows.map(([name,count])=>
    '<div class="street-row"><b>'+esc(name)+'</b><span>'+formatNumber(count)+'</span></div>'
  ).join(''):'<div class="empty-state">Nenhum logradouro carregado.</div>';
}

function renderVisitFilters(){
  const filters=[
    ['todos','Todos'],
    ['sem-visita','Sem visita'],
    ['365+','365+ dias'],
    ['180-364','180–364'],
    ['90-179','90–179'],
    ['60-89','60–89'],
    ['30-59','30–59'],
    ['<30','< 30 dias']
  ];
  $('#visitFilters').innerHTML=filters.map(([key,label])=>
    '<button class="chip '+(state.visitFilter===key?'active':'')+'" type="button" data-visit-filter="'+key+'">'+label+'</button>'
  ).join('');
}

function matchesQuery(person,typed){
  const raw=typed.trim();
  if(!raw)return true;
  const query=normalize(raw);
  const digits=raw.replace(/\D/g,'');
  return normalize(person.name).includes(query)||
    normalize(person.street).includes(query)||
    normalize(person.address).includes(query)||
    normalize(person.microarea).includes(query)||
    Boolean(digits&&String(person.cpf||'').replace(/\D/g,'').includes(digits))||
    Boolean(digits&&String(person.cns||'').replace(/\D/g,'').includes(digits));
}

function renderVisitList(){
  const typed=$('#visitSearch')?.value||'';
  let list=sortByLongestWithoutVisit(state.people).filter(person=>matchesQuery(person,typed));
  if(state.visitFilter!=='todos')list=list.filter(person=>statusOf(person).key===state.visitFilter);

  $('#visitList').innerHTML=list.length?list.slice(0,300).map(personCard).join(''):
    '<div class="empty-state"><strong>Nada encontrado</strong>Ajuste a busca ou o filtro.</div>';
}

function renderPeople(){
  const typed=$('#peopleSearch')?.value||'';
  const list=[...state.people]
    .filter(person=>matchesQuery(person,typed))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));

  $('#peopleList').innerHTML=list.length?list.slice(0,300).map(personCard).join(''):
    '<div class="empty-state"><strong>Nenhuma pessoa encontrada</strong>Importe o Território ou ajuste a busca.</div>';
}

function sourceCard(title,kind,base,buttonLabel){
  const ready=Boolean(base);
  const busy=Boolean(importBusy[kind]);
  const details=ready
    ? '<strong>'+esc(base.fileName||'Arquivo carregado')+'</strong><br>'+formatNumber(base.data.length)+' registros · cabeçalho na linha '+(base.headerIndex+1)+'<br><span class="source-ready">✓ Base pronta</span>'
    : 'Nenhum arquivo carregado.';
  return '<div class="source-card '+(ready?'ready ':'')+(busy?'busy':'')+'">'+
    '<span class="eyebrow">'+esc(title)+'</span>'+
    '<div class="source-status">'+details+'</div>'+
    '<button class="primary source-action" type="button" data-import-kind="'+kind+'" '+(busy?'disabled aria-busy="true"':'')+'>'+
      esc(busy?'Lendo...':buttonLabel)+
    '</button>'+
  '</div>';
}

function renderImportCards(){
  $('#sourceCards').innerHTML=
    sourceCard('BASE 1 · TERRITÓRIO / MICROÁREA','territory',state.territoryBase,state.territoryBase?'Atualizar Território':'Selecionar CSV/XLS/XLSX')+
    sourceCard('BASE 2 · ACOMPANHAMENTOS / CONDIÇÕES DE SAÚDE','followup',state.followupBase,state.followupBase?'Atualizar Acompanhamentos':'Selecionar CSV/XLS/XLSX');
}

function setImportFeedback(message,type='info'){
  const element=$('#importFeedback');
  if(!element)return;
  element.hidden=!message;
  element.textContent=message||'';
  element.className='import-feedback '+type;
}

function importLabel(kind){
  return kind==='territory'?'Território':'Acompanhamentos';
}

function friendlyImportError(error,kind){
  const fallback='Não foi possível processar este arquivo.';
  const raw=String(error?.message||fallback).trim();
  if(/ReferenceError|Cannot read|undefined is not|NaN/i.test(raw)){
    return 'Falha interna ao processar '+importLabel(kind)+'. A base anterior foi mantida. Tente novamente.';
  }
  return raw||fallback;
}

function successMessage(kind,parsed,nextTerritory,nextFollowup,derived){
  const label=importLabel(kind);
  const loaded=label+' carregado com '+formatNumber(parsed.data.length)+' registros.';
  if(nextTerritory&&nextFollowup&&derived.stats){
    return loaded+' Bases conciliadas com sucesso: '+formatNumber(derived.stats.matchedCount)+' pessoas conciliadas, '+
      formatNumber(derived.stats.territoryOnly)+' sem acompanhamento e '+
      formatNumber(derived.stats.followupOnlyRecords)+' registros de Acompanhamentos fora do Território.';
  }
  return loaded+' Aguardando '+(nextTerritory?'Acompanhamentos':'Território')+' para cruzar as bases.';
}

function renderQuality(){
  const panel=$('#qualitySummary');
  if(!state.territoryBase){
    panel.innerHTML='<div class="empty-state">Importe as bases para ver a qualidade da conciliação.</div>';
    return;
  }
  if(!state.followupBase){
    panel.innerHTML='<div class="empty-state"><strong>'+formatNumber(state.territoryBase.data.length)+' pessoas no Território</strong>Aguardando a segunda base.</div>';
    return;
  }

  const stats=state.stats;
  panel.innerHTML=
    '<div class="quality-grid">'+
      '<div><b>'+formatNumber(stats.territoryCount)+'</b><span>Território</span></div>'+
      '<div><b>'+formatNumber(stats.matchedCount)+'</b><span>Conciliadas</span></div>'+
      '<div><b>'+formatNumber(stats.territoryOnly)+'</b><span>Sem acompanhamento</span></div>'+
      '<div><b>'+formatNumber(stats.followupOnlyRecords)+'</b><span>Registros fora do Território</span></div>'+
    '</div>'+
    '<div class="quality-methods">Vínculos: <strong>'+formatNumber(stats.matchMethods.cpf)+' CPF</strong> · '+
      '<strong>'+formatNumber(stats.matchMethods.cns)+' CNS</strong> · '+
      '<strong>'+formatNumber(stats.matchMethods['nome+nascimento'])+' nome + nascimento</strong></div>'+
    (state.followupBase.meta.hasConditions
      ? ''
      : '<p class="data-note">Esta exportação não possui coluna de condições clínicas; o Zela não cria listas temáticas inexistentes.</p>');
}

function formatItem(label,value){
  return '<div class="format-item"><b>'+esc(label)+'</b><span>'+esc(value||'—')+'</span></div>';
}

function renderFormatInfo(){
  const territory=state.territoryBase;
  const followup=state.followupBase;
  $('#formatInfo').innerHTML=
    formatItem('Território',territory?territory.encoding+' · '+territory.data.length+' registros':'—')+
    formatItem('Acompanhamentos',followup?followup.encoding+' · '+followup.data.length+' registros':'—')+
    formatItem('Data da base',followup?.meta?.generatedAt||territory?.meta?.generatedAt||'—')+
    formatItem('Visita domiciliar',followup?.meta?.hasVisitElapsed?'Dias/meses encontrados':'Aguardando base');
}

function detailPerson(key){
  const person=state.people.find(item=>item.key===key);
  if(!person)return;
  const status=statusOf(person);
  const conditions=person.conditions?.length?person.conditions.join(', '):'Não informadas nesta exportação';
  const visitDate=person.lastVisitDate?formatDateSafe(person.lastVisitDate):'Sem visita localizada';
  const visitNote=person.lastVisitEstimated?'Estimativa calculada a partir de “dias/meses desde a última visita” e da data de geração do relatório.':'';

  $('#detailContent').innerHTML=
    '<span class="eyebrow">PESSOA</span>'+
    '<h2>'+esc(person.name)+'</h2>'+
    '<div class="detail-row"><b>Tempo sem visita</b>'+esc(status.label)+'</div>'+
    '<div class="detail-row"><b>Última visita</b>'+esc(visitDate)+(visitNote?'<small>'+esc(visitNote)+'</small>':'')+'</div>'+
    '<div class="detail-row"><b>Microárea</b>'+esc(person.microarea||'—')+'</div>'+
    '<div class="detail-row"><b>Endereço</b>'+esc(person.address||'—')+'</div>'+
    '<div class="detail-row"><b>Nascimento</b>'+esc(formatDateSafe(person.birth))+'</div>'+
    '<div class="detail-row"><b>Identificadores</b>CPF '+maskId(person.cpf)+' · CNS '+maskId(person.cns)+'</div>'+
    '<div class="detail-row"><b>Condições</b>'+esc(conditions)+'</div>'+
    '<div class="detail-row"><b>Conciliação</b>'+esc(person.matchMethod||'Sem correspondência no Acompanhamento')+'</div>';

  $('#detailDialog').showModal();
}

async function importKind(kind,file){
  const expected=kind==='territory'?'territory':'followup';
  const label=importLabel(kind);
  showView('dados');
  importBusy[kind]=true;
  renderImportCards();
  setImportFeedback('Lendo '+label+'...','info');

  try{
    const parsed=await parseFile(file,expected);
    setImportFeedback('Arquivo reconhecido como '+label+' · '+formatNumber(parsed.data.length)+' registros. Processando...','info');

    const nextTerritory=kind==='territory'?parsed:state.territoryBase;
    const nextFollowup=kind==='followup'?parsed:state.followupBase;

    if(nextTerritory&&nextFollowup)setImportFeedback('Cruzando as bases...','info');
    const derived=calculateDerived(nextTerritory,nextFollowup);

    Object.assign(state,{
      territoryBase:nextTerritory,
      followupBase:nextFollowup,
      ...derived
    });
    renderAll();
    setImportFeedback(successMessage(kind,parsed,nextTerritory,nextFollowup,derived),'success');
  }catch(error){
    showView('dados');
    setImportFeedback('Erro ao importar '+label+': '+friendlyImportError(error,kind),'error');
  }finally{
    importBusy[kind]=false;
    renderImportCards();
  }
}

function toast(message,error=false){
  const element=$('#dataStatus');
  element.textContent=message;
  element.classList.toggle('error',error);
  setTimeout(()=>{
    element.classList.remove('error');
    renderHeader();
  },5000);
}

function loadDemo(){
  state.territoryBase={
    data:demoRows.map((row,index)=>({...row,id:'demo-'+index,source:'territory'})),
    meta:{microarea:'DEMO',generatedAt:new Intl.DateTimeFormat('pt-BR').format(new Date()),dateFormat:'DD/MM/AAAA'},
    fileName:'demonstração fictícia.csv',
    headerIndex:0,
    encoding:'UTF-8'
  };
  state.followupBase=null;
  recalc();
  showView('painel');
  toast('Demonstração do Território carregada. Para calcular visitas, importe a base real de Acompanhamentos.');
}

function setVisitFilter(filter,openList=true){
  state.visitFilter=filter;
  renderVisitFilters();
  renderVisitList();
  if(openList)showView('visitas');
}

function bind(){
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-view-target],[data-go],[data-person],[data-visit-filter],[data-import-kind]');
    if(!target)return;

    if(target.dataset.viewTarget)showView(target.dataset.viewTarget);
    if(target.dataset.go)showView(target.dataset.go);
    if(target.dataset.person)detailPerson(target.dataset.person);
    if(target.dataset.visitFilter)setVisitFilter(target.dataset.visitFilter,true);
    if(target.dataset.importKind){
      const input=target.dataset.importKind==='territory'?$('#territoryInput'):$('#followupInput');
      input?.click();
    }
  });

  $('#importTopBtn').onclick=()=>showView('dados');
  $('#loadDemo').onclick=loadDemo;

  $('#territoryInput').onchange=event=>{
    const file=event.target.files?.[0];
    if(file)importKind('territory',file);
    event.target.value='';
  };

  $('#followupInput').onchange=event=>{
    const file=event.target.files?.[0];
    if(file)importKind('followup',file);
    event.target.value='';
  };

  $('#visitSearch').oninput=renderVisitList;
  $('#peopleSearch').oninput=renderPeople;

  window.addEventListener('online',()=>$('#offlineBanner').hidden=true);
  window.addEventListener('offline',()=>$('#offlineBanner').hidden=false);
}

function init(){
  const formatted=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date());
  $('#todayDate').textContent=formatted.charAt(0).toUpperCase()+formatted.slice(1);
  bind();
  renderAll();

  if('serviceWorker'in navigator){
    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloading)return;
      reloading=true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js?v=9',{updateViaCache:'none'})
      .then(registration=>registration.update())
      .catch(()=>{});
  }
  $('#offlineBanner').hidden=navigator.onLine;
}

init();
