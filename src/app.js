import{parseFile,parseDate,formatDate}from'./modules/csv.js';
import{buildPeople,getVisitState,maskId}from'./modules/model.js';
import{demoRows}from'./modules/demo.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const state={rows:[],people:[],meta:{},imports:[],visitFilter:'todos'};

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[c]));

const formatNumber=n=>new Intl.NumberFormat('pt-BR').format(n||0);

function recalc(){
  state.people=buildPeople(state.rows);
  renderAll();
}

function showView(view){
  $$('.view').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.viewTarget===view));
  window.scrollTo(0,0);
}

function statusOf(person){
  return getVisitState(person);
}

function sortPeopleForVisits(list){
  const order={agora:0,breve:1,historico:2,programada:3,'sem-data':4};
  return [...list].sort((a,b)=>{
    const sa=statusOf(a),sb=statusOf(b);
    const group=(order[sa.key]??9)-(order[sb.key]??9);
    if(group)return group;
    if(sa.key==='historico')return sa.sortValue-sb.sortValue;
    if(sa.sortValue!==sb.sortValue)return sa.sortValue-sb.sortValue;
    return a.name.localeCompare(b.name,'pt-BR');
  });
}

function renderAll(){
  renderHeader();
  renderMetrics();
  renderFocus();
  renderStreetSummary();
  renderVisitFilters();
  renderVisitList();
  renderPeople();
  renderFormatInfo();
  renderImportHistory();
}

function renderHeader(){
  $('#microareaLabel').textContent=state.meta.microarea?'MICROÁREA '+state.meta.microarea:'MICROÁREA —';

  if(!state.people.length){
    $('#dataStatus').textContent='Nenhuma base importada. Toque em + para carregar o CSV.';
    return;
  }

  const generated=state.meta.generatedAt?' · gerado em '+state.meta.generatedAt:'';
  $('#dataStatus').innerHTML='<strong>'+formatNumber(state.people.length)+' pessoas</strong> no painel'+generated+'.';
}

function metricCard(count,label,filter,icon,kind){
  return '<button class="metric-card '+(kind||'')+'" type="button" data-visit-filter="'+filter+'">'+
    '<span class="metric-icon">'+icon+'</span>'+
    '<b>'+formatNumber(count)+'</b>'+
    '<span>'+label+'</span>'+
  '</button>';
}

function renderMetrics(){
  const statuses=state.people.map(statusOf);
  const due=statuses.filter(s=>s.key==='agora').length;
  const soon=statuses.filter(s=>s.key==='breve').length;
  const history=statuses.filter(s=>s.key==='historico').length;
  const missing=statuses.filter(s=>s.key==='sem-data').length;

  $('#visitMetrics').innerHTML=
    metricCard(due,'Visitar agora','agora','!','due')+
    metricCard(soon,'Em até 7 dias','breve','↗','soon')+
    metricCard(history,'Com última visita','historico','◷','')+
    metricCard(missing,'Sem data de visita','sem-data','—','');
}

function personCard(person){
  const s=statusOf(person);
  const address=person.address||'Endereço não informado';
  return '<button class="person-card" type="button" data-person="'+esc(person.key)+'">'+
    '<div class="person-main">'+
      '<h3>'+esc(person.name)+'</h3>'+
      '<p>'+esc(address)+'</p>'+
    '</div>'+
    '<span class="status-pill '+esc(s.key)+'">'+esc(s.label)+'</span>'+
  '</button>';
}

function renderFocus(){
  const wrap=$('#focusList');
  const title=$('#focusTitle');
  if(!state.people.length){
    title.textContent='Quem olhar primeiro';
    wrap.innerHTML='<div class="empty-state"><strong>Importe o CSV do território</strong>O Zela organiza as pessoas assim que o arquivo for carregado.</div>';
    return;
  }

  const sorted=sortPeopleForVisits(state.people);
  const urgent=sorted.filter(p=>['agora','breve'].includes(statusOf(p).key));
  if(urgent.length){
    title.textContent='Quem olhar primeiro';
    wrap.innerHTML=urgent.slice(0,6).map(personCard).join('');
    return;
  }

  const history=sorted.filter(p=>statusOf(p).key==='historico');
  if(history.length){
    title.textContent='Há mais tempo sem visita registrada';
    wrap.innerHTML=history.slice(0,6).map(personCard).join('');
    return;
  }

  title.textContent='Datas de visita não vieram no arquivo';
  wrap.innerHTML='<div class="empty-state"><strong>O CSV foi lido corretamente</strong>Este relatório não contém “última visita” ou “próxima visita”. O Zela não inventa um prazo: importe um relatório que traga uma dessas datas para liberar a priorização de visitas.</div>';
}

function renderStreetSummary(){
  const counts={};
  for(const p of state.people){
    const street=p.street&&p.street!=='-'?p.street:'Sem logradouro';
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
    ['agora','Agora'],
    ['breve','Em breve'],
    ['historico','Mais tempo'],
    ['programada','Programadas'],
    ['sem-data','Sem data']
  ];
  $('#visitFilters').innerHTML=filters.map(([key,label])=>
    '<button class="chip '+(state.visitFilter===key?'active':'')+'" type="button" data-visit-filter="'+key+'">'+label+'</button>'
  ).join('');
}

function renderVisitList(){
  const query=($('#visitSearch')?.value||'').trim().toLowerCase();
  let list=sortPeopleForVisits(state.people);

  if(state.visitFilter!=='todos'){
    list=list.filter(p=>statusOf(p).key===state.visitFilter);
  }

  if(query){
    list=list.filter(p=>
      p.name.toLowerCase().includes(query)||
      String(p.street||'').toLowerCase().includes(query)||
      String(p.address||'').toLowerCase().includes(query)
    );
  }

  $('#visitList').innerHTML=list.length?list.slice(0,300).map(personCard).join(''):
    '<div class="empty-state"><strong>Nada encontrado</strong>Tente outro filtro ou outra busca.</div>';
}

function renderPeople(){
  const typed=($('#peopleSearch')?.value||'').trim();
  const text=typed.toLowerCase();
  const digits=typed.replace(/\D/g,'');
  let list=[...state.people].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));

  if(text){
    list=list.filter(p=>
      p.name.toLowerCase().includes(text)||
      String(p.street||'').toLowerCase().includes(text)||
      (digits&&String(p.cpf||'').replace(/\D/g,'').includes(digits))||
      (digits&&String(p.cns||'').replace(/\D/g,'').includes(digits))
    );
  }

  $('#peopleList').innerHTML=list.length?list.slice(0,300).map(personCard).join(''):
    '<div class="empty-state"><strong>Nenhuma pessoa encontrada</strong>Importe um CSV ou ajuste a busca.</div>';
}

function delimiterName(value){
  if(value===';')return'Ponto e vírgula (;)';
  if(value===',')return'Vírgula (,)';
  if(value==='\t')return'Tabulação';
  return value||'—';
}

function formatItem(label,value){
  return '<div class="format-item"><b>'+label+'</b><span>'+esc(value||'—')+'</span></div>';
}

function renderFormatInfo(){
  const last=state.imports[0]||{};
  $('#formatInfo').innerHTML=
    formatItem('Codificação',last.encoding||'—')+
    formatItem('Separador',delimiterName(last.delimiter))+
    formatItem('Datas',state.meta.dateFormat||'—')+
    formatItem('Datas de visita',state.meta.hasVisitDate?'Encontradas':'Não encontradas');
}

function renderImportHistory(){
  const last=state.imports[0];
  if(!last){
    $('#importHistory').textContent='Nenhuma importação nesta sessão.';
    return;
  }

  $('#importHistory').innerHTML=
    '<strong>'+esc(last.file)+'</strong><br>'+
    formatNumber(last.count)+' registros · cabeçalho na linha '+last.headerLine+
    ' · '+esc(last.encoding)+' · '+esc(state.meta.dateFormat||'data não identificada');
}

function detailPerson(key){
  const p=state.people.find(x=>x.key===key);
  if(!p)return;
  const s=statusOf(p);

  $('#detailContent').innerHTML=
    '<span class="eyebrow">PESSOA</span>'+
    '<h2>'+esc(p.name)+'</h2>'+
    '<div class="detail-row"><b>Situação de visita</b>'+esc(s.label)+'</div>'+
    '<div class="detail-row"><b>Última visita encontrada</b>'+formatDate(p.lastVisit)+'</div>'+
    '<div class="detail-row"><b>Próxima visita encontrada</b>'+formatDate(p.nextVisit)+'</div>'+
    '<div class="detail-row"><b>Endereço</b>'+esc(p.address||'—')+'</div>'+
    '<div class="detail-row"><b>Nascimento</b>'+formatDate(p.birth)+'</div>'+
    '<div class="detail-row"><b>Identificadores</b>CPF '+maskId(p.cpf)+' · CNS '+maskId(p.cns)+'</div>'+
    '<div class="detail-row"><b>Importante</b>O Zela apenas organiza as datas presentes no arquivo. Ele não cria periodicidade clínica nem substitui o registro oficial no e-SUS.</div>';

  $('#detailDialog').showModal();
}

async function importFile(file){
  try{
    const out=await parseFile(file);
    state.rows=out.data;
    state.meta=out.meta;
    state.imports.unshift({
      file:file.name,
      count:out.data.length,
      encoding:out.encoding,
      delimiter:out.delimiter,
      headerLine:out.headerIndex+1,
      at:new Date().toISOString()
    });
    recalc();
    toast('Arquivo lido: '+out.data.length+' pessoas · datas '+(out.meta.dateFormat||'não identificadas')+'.');
  }catch(error){
    toast(error?.message||'Não foi possível ler este CSV.',true);
  }
}

function toast(message,error=false){
  const el=$('#dataStatus');
  el.textContent=message;
  el.style.borderColor=error?'#e7b3b0':'#9bc7bc';
  setTimeout(()=>{
    el.style.borderColor='';
    renderHeader();
  },4200);
}

function toBrDate(date){
  const d=String(date.getDate()).padStart(2,'0');
  const m=String(date.getMonth()+1).padStart(2,'0');
  return d+'/'+m+'/'+date.getFullYear();
}

function demoWithVisits(){
  const now=new Date();
  const shift=days=>{
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+days);
    return toBrDate(d);
  };
  return demoRows.map((row,index)=>({
    ...row,
    lastVisit:index<3?shift(-(20+index*35)):'',
    nextVisit:index===0?shift(-2):index===1?shift(4):''
  }));
}

function loadDemo(){
  state.rows=demoWithVisits();
  state.meta={
    microarea:'DEMO',
    generatedAt:toBrDate(new Date()),
    dateFormat:'DD/MM/AAAA',
    hasVisitDate:true
  };
  state.imports=[{
    file:'demonstração fictícia',
    count:state.rows.length,
    encoding:'UTF-8',
    delimiter:';',
    headerLine:1,
    at:new Date().toISOString()
  }];
  recalc();
  showView('painel');
  toast('Demonstração carregada com dados fictícios.');
}

function setVisitFilter(filter,openList=true){
  state.visitFilter=filter;
  renderVisitFilters();
  renderVisitList();
  if(openList)showView('visitas');
}

function bind(){
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-view-target],[data-go],[data-person],[data-visit-filter]');
    if(!target)return;

    if(target.dataset.viewTarget)showView(target.dataset.viewTarget);
    if(target.dataset.go)showView(target.dataset.go);
    if(target.dataset.person)detailPerson(target.dataset.person);
    if(target.dataset.visitFilter)setVisitFilter(target.dataset.visitFilter,true);
  });

  $('#importTopBtn').onclick=()=>$('#csvInput').click();
  $('#importNow').onclick=()=>$('#csvInput').click();
  $('#loadDemo').onclick=loadDemo;
  $('#csvInput').onchange=event=>{
    const file=event.target.files?.[0];
    if(file)importFile(file);
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
    navigator.serviceWorker.register('./sw.js?v=7',{updateViaCache:'none'})
      .then(registration=>registration.update())
      .catch(()=>{});
  }
  $('#offlineBanner').hidden=navigator.onLine;
}

init();