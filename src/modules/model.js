import{parseDate,normalize}from'./csv.js';

export const DEFAULT_THRESHOLDS={recent:30,attention:60,late:90};
const DAY=86400000;

export const normalizeId=value=>String(value||'').replace(/D/g,'');
export const validCpf=value=>{const d=normalizeId(value);return d.length===11?d:'';};
export const validCns=value=>{const d=normalizeId(value);return d.length===15?d:'';};

export const maskId=value=>{
  const s=normalizeId(value);
  if(!s)return'—';
  if(s.length<=4)return'••••';
  return s.slice(0,3)+'••••'+s.slice(-2);
};

export const age=(birth,now=new Date())=>{
  const d=parseDate(birth);
  if(!d)return null;
  let years=now.getFullYear()-d.getFullYear();
  const m=now.getMonth()-d.getMonth();
  if(m<0||(m===0&&now.getDate()<d.getDate()))years--;
  return years>=0?years:null;
};

const startOfDay=date=>new Date(date.getFullYear(),date.getMonth(),date.getDate());

function safeInt(value){
  const s=String(value??'').trim();
  if(!s||s==='-')return null;
  const n=Number.parseInt(s,10);
  return Number.isFinite(n)&&n>=0?n:null;
}

function subtractMonthsClamped(date,months){
  const source=startOfDay(date);
  const originalDay=source.getDate();
  const target=new Date(source.getFullYear(),source.getMonth()-months,1);
  const lastDay=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
  target.setDate(Math.min(originalDay,lastDay));
  return target;
}

export function inferLastVisitDate(followupMeta,followupRow){
  const reportDate=parseDate(followupMeta?.generatedDate||followupMeta?.generatedAt);
  const months=safeInt(followupRow?.visitMonths);
  const days=safeInt(followupRow?.visitDays);
  if(!reportDate||(months==null&&days==null))return null;
  const byMonths=subtractMonthsClamped(reportDate,months||0);
  return new Date(byMonths.getFullYear(),byMonths.getMonth(),byMonths.getDate()-(days||0));
}

export function daysSince(date,now=new Date()){
  if(!(date instanceof Date)||Number.isNaN(date.getTime()))return null;
  return Math.max(0,Math.floor((startOfDay(now)-startOfDay(date))/DAY));
}

function identityKey(row){
  const cpf=validCpf(row?.cpf);
  const cns=validCns(row?.cns);
  if(cpf)return'cpf:'+cpf;
  if(cns)return'cns:'+cns;
  return'namebirth:'+normalize(row?.name)+'|'+String(row?.birth||'');
}

function addressOf(row){
  const street=[row?.streetType,row?.street].filter(v=>v&&v!=='-').join(' ').trim();
  return [street,row?.number,row?.complement,row?.district].filter(v=>v&&v!=='-').join(', ');
}

function familyKey(row){
  const rid=normalizeId(row?.responsibleId);
  if(rid)return'family:'+rid;
  if(row?.responsibleName&&row.responsibleName!=='-')return'family-name:'+normalize(row.responsibleName)+'|'+normalize(addressOf(row));
  return'home:'+normalize(addressOf(row));
}

function uniqueMap(rows,getKey){
  const map=new Map();
  const duplicates=new Set();
  rows.forEach((row,index)=>{
    const key=getKey(row);
    if(!key)return;
    if(map.has(key)){duplicates.add(key);map.delete(key);}
    else if(!duplicates.has(key))map.set(key,index);
  });
  return{map,duplicates};
}

function exactNameBirth(row){
  const name=normalize(row?.name);
  const birth=String(row?.birth||'').trim();
  return name&&birth&&birth!=='-'?name+'|'+birth:'';
}

export function mergeBases(territoryBase,followupBase,now=new Date()){
  const territory=territoryBase?.data||[];
  const followup=followupBase?.data||[];
  const cpfIndex=uniqueMap(territory,row=>validCpf(row.cpf));
  const cnsIndex=uniqueMap(territory,row=>validCns(row.cns));
  const nameBirthIndex=uniqueMap(territory,exactNameBirth);
  const matchedTerritory=new Set();
  const matchForFollowup=new Map();
  const inconsistencies=[];
  const matchMethods={cpf:0,cns:0,'nome+nascimento':0};

  followup.forEach((row,fi)=>{
    const cpf=validCpf(row.cpf);
    const cns=validCns(row.cns);
    let ti=null,method='';
    if(cpf&&cpfIndex.map.has(cpf)){ti=cpfIndex.map.get(cpf);method='cpf';}
    else if(cns&&cnsIndex.map.has(cns)){ti=cnsIndex.map.get(cns);method='cns';}
    else if(!cpf&&!cns){
      const fallback=exactNameBirth(row);
      if(fallback&&nameBirthIndex.map.has(fallback)){ti=nameBirthIndex.map.get(fallback);method='nome+nascimento';}
    }
    if(ti==null){
      inconsistencies.push({type:'followup-only',name:row.name,birth:row.birth,reason:'Registro do Acompanhamento sem correspondência segura no Território.'});
      return;
    }
    if(matchedTerritory.has(ti)){
      inconsistencies.push({type:'ambiguous',name:row.name,birth:row.birth,reason:'Mais de um registro de Acompanhamento apontou para a mesma pessoa do Território.'});
      return;
    }
    const target=territory[ti];
    const targetCpf=validCpf(target.cpf);
    if(method==='cns'&&cpf&&targetCpf&&cpf!==targetCpf){
      inconsistencies.push({type:'id-conflict',name:row.name,birth:row.birth,reason:'CNS coincide, mas os CPFs divergem. Registro mantido com alerta para conferência.'});
    }
    matchedTerritory.add(ti);
    matchForFollowup.set(fi,{ti,method});
    matchMethods[method]++;
  });

  const followupByTerritory=new Map();
  for(const[fi,match]of matchForFollowup)followupByTerritory.set(match.ti,followup[fi]);

  const people=territory.map((row,ti)=>{
    const f=followupByTerritory.get(ti)||null;
    const lastVisit=f?inferLastVisitDate(followupBase.meta,f):null;
    let matchMethod=null;
    if(f){
      for(const match of matchForFollowup.values())if(match.ti===ti){matchMethod=match.method;break;}
    }
    return{
      ...row,
      key:identityKey(row),
      age:age(row.birth,now),
      address:addressOf(row),
      familyKey:familyKey(row),
      followup:f,
      matchMethod,
      lastVisitDate:lastVisit?lastVisit.toISOString().slice(0,10):'',
      lastVisitEstimated:Boolean(lastVisit),
      daysSinceVisit:lastVisit?daysSince(lastVisit,now):null,
      visitElapsedAtReport:f?{months:safeInt(f.visitMonths),days:safeInt(f.visitDays)}:null,
      sourceStatus:f?'matched':'territory-only'
    };
  });

  followup.forEach((row,fi)=>{
    if(matchForFollowup.has(fi))return;
    const lastVisit=inferLastVisitDate(followupBase?.meta,row);
    people.push({
      ...row,
      key:'followup:'+identityKey(row)+':'+fi,
      age:age(row.birth,now),
      address:addressOf(row),
      familyKey:'followup-only:'+fi,
      followup:row,
      matchMethod:null,
      lastVisitDate:lastVisit?lastVisit.toISOString().slice(0,10):'',
      lastVisitEstimated:Boolean(lastVisit),
      daysSinceVisit:lastVisit?daysSince(lastVisit,now):null,
      visitElapsedAtReport:{months:safeInt(row.visitMonths),days:safeInt(row.visitDays)},
      sourceStatus:'followup-only'
    });
  });

  territory.forEach((row,ti)=>{
    if(!matchedTerritory.has(ti)){
      inconsistencies.push({type:'territory-only',name:row.name,birth:row.birth,reason:'Pessoa do Território sem registro correspondente no Acompanhamento Geral importado.'});
    }
  });

  return{
    people,
    inconsistencies,
    stats:{
      territoryCount:territory.length,
      followupCount:followup.length,
      matchedCount:matchedTerritory.size,
      territoryOnly:territory.length-matchedTerritory.size,
      followupOnly:followup.length-matchForFollowup.size,
      matchMethods
    }
  };
}

export function getVisitState(person,thresholds=DEFAULT_THRESHOLDS){
  const days=Number.isFinite(person?.daysSinceVisit)?person.daysSinceVisit:null;
  if(days==null)return{key:'sem-info',label:'Sem informação de visita',days:null,sortValue:-1};
  if(days<=thresholds.recent)return{key:'recente',label:'Visitado há '+days+' dia(s)',days,sortValue:days};
  if(days<=thresholds.attention)return{key:'atencao',label:'Há '+days+' dia(s) sem visita',days,sortValue:days};
  if(days<=thresholds.late)return{key:'atrasado',label:'Há '+days+' dia(s) sem visita',days,sortValue:days};
  return{key:'muito-atrasado',label:'Há '+days+' dia(s) sem visita',days,sortValue:days};
}

export function sortByLongestWithoutVisit(people){
  return[...people].sort((a,b)=>{
    const ad=Number.isFinite(a.daysSinceVisit)?a.daysSinceVisit:-1;
    const bd=Number.isFinite(b.daysSinceVisit)?b.daysSinceVisit:-1;
    if(ad!==bd)return bd-ad;
    return String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
  });
}

export function buildFamilies(people){
  const families=new Map();
  for(const person of people){
    const key=person.familyKey||'person:'+person.key;
    if(!families.has(key))families.set(key,{id:key,responsible:person.responsibleName||person.name,address:person.address,members:[]});
    families.get(key).members.push(person);
  }
  return[...families.values()];
}

export function explainPriority(person,thresholds=DEFAULT_THRESHOLDS){
  const state=getVisitState(person,thresholds);
  const reasons=[];
  if(state.days!=null)reasons.push(state.days+' dia(s) desde a última visita estimada a partir do relatório do e-SUS');
  else reasons.push('sem informação de visita no Acompanhamento importado');
  if(person.age!=null&&person.age>=60)reasons.push('idade de '+person.age+' anos');
  if(person.sourceStatus!=='matched')reasons.push('bases não cruzadas completamente para este registro');
  return reasons;
}
