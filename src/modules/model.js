import{parseDate,normalize}from'./csv.js';

export const maskId=v=>{
  const s=String(v||'').replace(/\D/g,'');
  if(!s)return'—';
  if(s.length<=4)return'••••';
  return s.slice(0,3)+'••••'+s.slice(-2);
};

export const age=(birth,now=new Date())=>{
  const d=parseDate(birth);
  if(!d)return null;
  let a=now.getFullYear()-d.getFullYear();
  const m=now.getMonth()-d.getMonth();
  if(m<0||(m===0&&now.getDate()<d.getDate()))a--;
  return a;
};

const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());

export function getVisitState(person,now=new Date()){
  const today=startOfDay(now);
  const next=parseDate(person.nextVisit);
  const last=parseDate(person.lastVisit);
  const day=86400000;

  if(next){
    const diff=Math.round((startOfDay(next)-today)/day);
    if(diff<=0){
      return{
        key:'agora',
        label:diff===0?'Visita prevista hoje':'Visita prevista há '+Math.abs(diff)+' dia(s)',
        nextDate:next,
        lastDate:last,
        sortValue:next.getTime()
      };
    }
    if(diff<=7){
      return{
        key:'breve',
        label:'Visita prevista em '+diff+' dia(s)',
        nextDate:next,
        lastDate:last,
        sortValue:next.getTime()
      };
    }
    return{
      key:'programada',
      label:'Visita programada',
      nextDate:next,
      lastDate:last,
      sortValue:next.getTime()
    };
  }

  if(last){
    const elapsed=Math.max(0,Math.floor((today-startOfDay(last))/day));
    return{
      key:'historico',
      label:'Última visita há '+elapsed+' dia(s)',
      nextDate:null,
      lastDate:last,
      ageDays:elapsed,
      sortValue:last.getTime()
    };
  }

  return{
    key:'sem-data',
    label:'Sem data de visita no arquivo',
    nextDate:null,
    lastDate:null,
    sortValue:Number.MAX_SAFE_INTEGER
  };
}

export function buildPeople(rows){
  const seen=new Map();

  for(const r of rows){
    const cpf=String(r.cpf||'').replace(/\D/g,'');
    const cns=String(r.cns||'').replace(/\D/g,'');
    const key=cpf&&r.cpf!=='-'?'cpf:'+cpf:
      cns&&r.cns!=='-'?'cns:'+cns:
      'n:'+normalize(r.name)+'|'+String(r.birth||'');

    const normalized={
      ...r,
      key,
      age:age(r.birth),
      address:[r.streetType,r.street,r.number,r.district]
        .filter(x=>x&&x!=='-')
        .join(' ')
    };

    if(!seen.has(key)){
      seen.set(key,normalized);
      continue;
    }

    const current=seen.get(key);
    for(const field of ['birth','cpf','cns','sex','streetType','street','number','district','reference','responsibleFlag','responsibleId','responsibleName']){
      if((!current[field]||current[field]==='-')&&normalized[field]&&normalized[field]!=='-')current[field]=normalized[field];
    }

    const curLast=parseDate(current.lastVisit);
    const newLast=parseDate(normalized.lastVisit);
    if(newLast&&(!curLast||newLast>curLast))current.lastVisit=normalized.lastVisit;

    const curNext=parseDate(current.nextVisit);
    const newNext=parseDate(normalized.nextVisit);
    if(newNext&&(!curNext||newNext<curNext))current.nextVisit=normalized.nextVisit;

    current.age=age(current.birth);
    current.address=[current.streetType,current.street,current.number,current.district]
      .filter(x=>x&&x!=='-')
      .join(' ');
  }

  return[...seen.values()];
}

export function buildFamilies(people){
  const fam=new Map();
  for(const p of people){
    const k=p.responsibleId&&p.responsibleId!=='-'?p.responsibleId:p.responsibleName||p.address||p.key;
    if(!fam.has(k))fam.set(k,{id:k,responsible:p.responsibleName||p.name,address:p.address,members:[]});
    fam.get(k).members.push(p);
  }
  return[...fam.values()];
}

export function buildAlerts(people){
  const alerts=[];
  for(const p of people){
    const push=(category,state,title,why,priority=50)=>alerts.push({
      id:p.key+'-'+category+'-'+alerts.length,
      personKey:p.key,
      personName:p.name,
      category,
      state,
      title,
      why,
      priority,
      deadline:'Conferir conforme regra vigente',
      action:'Verifique o registro de origem antes de qualquer ação.'
    });

    if(!parseDate(p.birth))push('dados','dados insuficientes','Data de nascimento ausente ou inválida','Não foi possível calcular a idade com segurança.',65);
    if((!p.cpf||p.cpf==='-')&&(!p.cns||p.cns==='-'))push('cadastro','requer conferência manual','CPF e CNS não encontrados','O relatório não trouxe um identificador oficial disponível para esta pessoa.',80);
    if(!p.responsibleName&&!p.responsibleId)push('familia','dados insuficientes','Vínculo familiar incompleto','Não foi possível identificar responsável familiar no arquivo importado.',55);
  }
  return alerts.sort((a,b)=>b.priority-a.priority);
}
