import{parseDate,normalize}from'./csv.js';

export const DEFAULT_THRESHOLDS={recent:30,attention:60,late:90};
const DAY=86400000;

export const normalizeId=value=>String(value??'').replace(/\D/g,'');
export const validCpf=value=>{const digits=normalizeId(value);return digits.length===11?digits:'';};
export const validCns=value=>{const digits=normalizeId(value);return digits.length===15?digits:'';};

export const maskId=value=>{
  const digits=normalizeId(value);
  if(!digits)return'—';
  if(digits.length<=4)return'••••';
  return digits.slice(0,3)+'••••'+digits.slice(-2);
};

const startOfDay=date=>new Date(date.getFullYear(),date.getMonth(),date.getDate());

export const age=(birth,now=new Date())=>{
  const date=parseDate(birth);
  if(!date)return null;
  let years=now.getFullYear()-date.getFullYear();
  const monthDelta=now.getMonth()-date.getMonth();
  if(monthDelta<0||(monthDelta===0&&now.getDate()<date.getDate()))years--;
  return years>=0?years:null;
};

function safeInt(value){
  const text=String(value??'').trim();
  if(!text||text==='-')return null;
  const number=Number.parseInt(text,10);
  return Number.isFinite(number)&&number>=0?number:null;
}

function subtractMonthsClamped(date,months){
  const source=startOfDay(date);
  const day=source.getDate();
  const target=new Date(source.getFullYear(),source.getMonth()-months,1);
  const monthLastDay=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
  target.setDate(Math.min(day,monthLastDay));
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

function dateKey(value){
  const date=parseDate(value);
  if(!date)return String(value??'').trim();
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}

function exactNameBirth(row){
  const name=normalize(row?.name);
  const birth=dateKey(row?.birth);
  return name&&birth&&birth!=='-'?name+'|'+birth:'';
}

function identityKey(row,prefix='person'){
  const cpf=validCpf(row?.cpf);
  const cns=validCns(row?.cns);
  if(cpf)return'cpf:'+cpf;
  if(cns)return'cns:'+cns;
  const fallback=exactNameBirth(row);
  return fallback?'namebirth:'+fallback:prefix+':'+normalize(row?.name)+'|'+String(row?.id||'');
}

function addressOf(row){
  const street=[row?.streetType,row?.street].filter(value=>value&&value!=='-').join(' ').trim();
  return[street,row?.number,row?.complement,row?.district].filter(value=>value&&value!=='-').join(', ');
}

function familyKey(row){
  const responsibleId=normalizeId(row?.responsibleId);
  if(responsibleId)return'family:'+responsibleId;
  if(row?.responsibleName&&row.responsibleName!=='-')return'family-name:'+normalize(row.responsibleName)+'|'+normalize(addressOf(row));
  return'home:'+normalize(addressOf(row));
}

function uniqueMap(rows,getKey){
  const map=new Map();
  const duplicates=new Set();
  rows.forEach((row,index)=>{
    const key=getKey(row);
    if(!key)return;
    if(map.has(key)){
      duplicates.add(key);
      map.delete(key);
    }else if(!duplicates.has(key)){
      map.set(key,index);
    }
  });
  return{map,duplicates};
}

function matchFollowupRow(row,indexes){
  const cpf=validCpf(row.cpf);
  const cns=validCns(row.cns);
  if(cpf){
    if(indexes.cpf.map.has(cpf))return{territoryIndex:indexes.cpf.map.get(cpf),method:'cpf'};
    return{territoryIndex:null,method:'unmatched',reason:'CPF do Acompanhamento não foi localizado no Território.'};
  }
  if(cns){
    if(indexes.cns.map.has(cns))return{territoryIndex:indexes.cns.map.get(cns),method:'cns'};
    return{territoryIndex:null,method:'unmatched',reason:'CNS do Acompanhamento não foi localizado no Território.'};
  }
  const fallback=exactNameBirth(row);
  if(fallback&&indexes.nameBirth.map.has(fallback))return{territoryIndex:indexes.nameBirth.map.get(fallback),method:'nome+nascimento'};
  if(fallback&&indexes.nameBirth.duplicates.has(fallback))return{territoryIndex:null,method:'unmatched',reason:'Nome e data de nascimento são ambíguos no Território.'};
  return{territoryIndex:null,method:'unmatched',reason:'Registro sem CPF/CNS e sem vínculo único por nome + nascimento.'};
}

function splitConditions(value){
  const text=String(value??'').trim();
  if(!text||text==='-')return[];
  return text.split(/[;,|]/).map(item=>item.trim()).filter(Boolean);
}

function latestVisit(meta,rows){
  let latest=null;
  for(const row of rows){
    const inferred=inferLastVisitDate(meta,row);
    if(inferred&&(!latest||inferred>latest))latest=inferred;
  }
  return latest;
}

function mergeConditions(rows){
  const seen=new Map();
  for(const row of rows){
    for(const condition of splitConditions(row.conditions)){
      const key=normalize(condition);
      if(key&&!seen.has(key))seen.set(key,condition);
    }
  }
  return[...seen.values()];
}

export function mergeBases(territoryBase,followupBase,now=new Date()){
  const territory=territoryBase?.data||[];
  const followup=followupBase?.data||[];
  const indexes={
    cpf:uniqueMap(territory,row=>validCpf(row.cpf)),
    cns:uniqueMap(territory,row=>validCns(row.cns)),
    nameBirth:uniqueMap(territory,exactNameBirth)
  };

  const followupByTerritory=new Map();
  const followupOnlyGroups=new Map();
  const inconsistencies=[];
  const matchMethods={cpf:0,cns:0,'nome+nascimento':0};
  const matchedTerritory=new Set();
  let matchedFollowupRecords=0;

  followup.forEach((row,followupIndex)=>{
    const match=matchFollowupRow(row,indexes);
    if(match.territoryIndex==null){
      const key=identityKey(row,'followup-'+followupIndex);
      if(!followupOnlyGroups.has(key))followupOnlyGroups.set(key,[]);
      followupOnlyGroups.get(key).push(row);
      inconsistencies.push({
        type:'followup-only',
        name:row.name,
        birth:row.birth,
        reason:match.reason
      });
      return;
    }

    const target=territory[match.territoryIndex];
    const targetCpf=validCpf(target.cpf);
    const targetCns=validCns(target.cns);
    const rowCpf=validCpf(row.cpf);
    const rowCns=validCns(row.cns);
    if(rowCpf&&targetCpf&&rowCpf!==targetCpf){
      inconsistencies.push({type:'id-conflict',name:row.name,birth:row.birth,reason:'CPF divergente entre as bases.'});
      return;
    }
    if(rowCns&&targetCns&&rowCns!==targetCns){
      inconsistencies.push({type:'id-conflict',name:row.name,birth:row.birth,reason:'CNS divergente entre as bases.'});
      return;
    }

    if(!followupByTerritory.has(match.territoryIndex))followupByTerritory.set(match.territoryIndex,[]);
    followupByTerritory.get(match.territoryIndex).push(row);
    matchedTerritory.add(match.territoryIndex);
    matchedFollowupRecords++;
    matchMethods[match.method]++;
  });

  const people=territory.map((row,territoryIndex)=>{
    const events=followupByTerritory.get(territoryIndex)||[];
    const lastVisit=latestVisit(followupBase?.meta,events);
    const firstEvent=events[0]||null;
    let matchMethod=null;
    if(firstEvent){
      const matched=matchFollowupRow(firstEvent,indexes);
      matchMethod=matched.method==='unmatched'?null:matched.method;
    }
    return{
      ...row,
      key:identityKey(row,'territory-'+territoryIndex),
      age:age(row.birth,now),
      address:addressOf(row),
      familyKey:familyKey(row),
      followup:firstEvent,
      followupEvents:events,
      conditions:mergeConditions(events),
      matchMethod,
      lastVisitDate:lastVisit?dateKey(lastVisit):'',
      lastVisitEstimated:Boolean(lastVisit),
      daysSinceVisit:lastVisit?daysSince(lastVisit,now):null,
      sourceStatus:events.length?'matched':'territory-only'
    };
  });

  for(const[index,row]of territory.entries()){
    if(!matchedTerritory.has(index)&&followup.length){
      inconsistencies.push({
        type:'territory-only',
        name:row.name,
        birth:row.birth,
        reason:'Pessoa do Território sem registro correspondente no Acompanhamento importado.'
      });
    }
  }

  const followupOnlyPeople=[];
  for(const[identity,events]of followupOnlyGroups.entries()){
    const first=events[0];
    const lastVisit=latestVisit(followupBase?.meta,events);
    followupOnlyPeople.push({
      ...first,
      key:'followup-only:'+identity,
      age:age(first.birth,now),
      address:addressOf(first),
      followup:first,
      followupEvents:events,
      conditions:mergeConditions(events),
      matchMethod:null,
      lastVisitDate:lastVisit?dateKey(lastVisit):'',
      lastVisitEstimated:Boolean(lastVisit),
      daysSinceVisit:lastVisit?daysSince(lastVisit,now):null,
      sourceStatus:'followup-only'
    });
  }

  return{
    people,
    followupOnlyPeople,
    inconsistencies,
    stats:{
      territoryCount:territory.length,
      followupRecordCount:followup.length,
      matchedCount:matchedTerritory.size,
      matchedFollowupRecords,
      territoryOnly:territory.length-matchedTerritory.size,
      followupOnlyRecords:followup.length-matchedFollowupRecords,
      followupOnlyPeople:followupOnlyPeople.length,
      matchMethods
    }
  };
}

export function getVisitState(person){
  const days=Number.isFinite(person?.daysSinceVisit)?person.daysSinceVisit:null;
  if(days==null)return{key:'sem-visita',label:'Sem visita localizada',days:null,sortValue:Number.POSITIVE_INFINITY};
  if(days>=365)return{key:'365+',label:days+' dias sem visita',days,sortValue:days};
  if(days>=180)return{key:'180-364',label:days+' dias sem visita',days,sortValue:days};
  if(days>=90)return{key:'90-179',label:days+' dias sem visita',days,sortValue:days};
  if(days>=60)return{key:'60-89',label:days+' dias sem visita',days,sortValue:days};
  if(days>=30)return{key:'30-59',label:days+' dias sem visita',days,sortValue:days};
  return{key:'<30',label:days+' dias sem visita',days,sortValue:days};
}

export function sortByLongestWithoutVisit(people){
  return[...people].sort((a,b)=>{
    const aMissing=!Number.isFinite(a.daysSinceVisit);
    const bMissing=!Number.isFinite(b.daysSinceVisit);
    if(aMissing!==bMissing)return aMissing?-1:1;
    if(!aMissing&&a.daysSinceVisit!==b.daysSinceVisit)return b.daysSinceVisit-a.daysSinceVisit;
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

export function explainPriority(person){
  const state=getVisitState(person);
  const reasons=[];
  if(state.days!=null)reasons.push(state.days+' dia(s) desde a última visita estimada a partir do relatório do e-SUS');
  else reasons.push('nenhuma visita localizada na base de Acompanhamentos importada');
  if(person.conditions?.length)reasons.push(person.conditions.join(', '));
  if(person.sourceStatus!=='matched')reasons.push('bases não conciliadas para este registro');
  return reasons;
}
