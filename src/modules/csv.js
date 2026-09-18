const aliases={
  name:['nome cidadao','nome cidadão','nome','cidadao','cidadão'],
  birth:['data de nascimento','data nascimento','dt nascimento','nascimento'],
  cpf:['cpf'],
  cns:['cns','cartao sus','cartão sus'],
  streetType:['tipo de logradouro','tipo logradouro'],
  street:['logradouro','rua'],
  number:['numero','número','nro'],
  district:['bairro'],
  ref:['ponto de referencia','ponto de referência'],
  responsibleFlag:['e o responsavel familiar?','é o responsável familiar?','responsavel familiar?'],
  responsibleId:['cpf/cns responsavel familiar','cpf/cns responsável familiar'],
  responsibleName:['nome do responsavel familiar','nome do responsável familiar'],
  sex:['sexo'],
  lastVisit:[
    'data da ultima visita','data da última visita','ultima visita','última visita',
    'data ultima visita','data última visita','data de visita','data da visita',
    'dt visita','ultima visita domiciliar','última visita domiciliar'
  ],
  nextVisit:[
    'data da proxima visita','data da próxima visita','proxima visita','próxima visita',
    'data prevista da visita','data prevista visita','proxima visita domiciliar',
    'próxima visita domiciliar','retorno previsto'
  ]
};

export const normalize=s=>String(s??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/\s+/g,' ')
  .trim()
  .toLowerCase();

const cleanCell=v=>String(v??'').replace(/^\ufeff/,'').replace(/\t/g,'').trim();

export function detectEncoding(buf){
  const b=new Uint8Array(buf);
  if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)return'utf-8';
  try{new TextDecoder('utf-8',{fatal:true}).decode(b);return'utf-8'}
  catch{return'windows-1252'}
}

export function decodeBuffer(buf){
  const enc=detectEncoding(buf);
  return{text:new TextDecoder(enc).decode(buf),encoding:enc};
}

function countDelim(line,d){
  let n=0,q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"')q=!q;
    else if(c===d&&!q)n++;
  }
  return n;
}

export function detectDelimiter(text){
  const lines=text.split(/\r?\n/).filter(Boolean).slice(0,30);
  const ds=[';',',','\t'];
  return ds.sort((a,b)=>
    lines.reduce((s,l)=>s+countDelim(l,b),0)-
    lines.reduce((s,l)=>s+countDelim(l,a),0)
  )[0]||';';
}

export function parseLine(line,delim){
  const out=[];let cur='',q=false;
  for(let i=0;i<=line.length;i++){
    const c=line[i];
    if(i===line.length||(!q&&c===delim)){out.push(cleanCell(cur));cur='';continue}
    if(c==='"'){
      if(q&&line[i+1]==='"'){cur+='"';i++}
      else q=!q;
    }else cur+=c;
  }
  return out;
}

export function detectDateFormat(values){
  const formats=new Set();
  for(const raw of values||[]){
    const s=cleanCell(raw);
    if(!s||s==='-')continue;
    if(/^\d{1,2}\/\d{1,2}\/\d{4}(?:\s|$)/.test(s))formats.add('DD/MM/AAAA');
    else if(/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(s))formats.add('AAAA-MM-DD');
    else if(/^\d{1,2}-\d{1,2}-\d{4}(?:\s|$)/.test(s))formats.add('DD-MM-AAAA');
  }
  if(formats.size===0)return'não identificado';
  if(formats.size===1)return[...formats][0];
  return'misto: '+[...formats].join(' + ');
}

export function parseText(text){
  const delim=detectDelimiter(text);
  const rows=text.split(/\r?\n/).filter(l=>l.trim()).map(l=>parseLine(l,delim));
  let headerIndex=-1,best=0;

  rows.forEach((r,i)=>{
    const ns=r.map(normalize);
    let score=0;
    for(const vals of Object.values(aliases)){
      if(vals.some(a=>ns.includes(normalize(a))))score++;
    }
    if(score>best&&r.filter(Boolean).length>=4){best=score;headerIndex=i}
  });

  if(headerIndex<0)throw new Error('Não foi possível localizar a linha de cabeçalho.');

  const header=rows[headerIndex].map(cleanCell);
  const map={};
  header.forEach((h,i)=>{
    const n=normalize(h);
    for(const[k,vals]of Object.entries(aliases)){
      if(vals.some(a=>normalize(a)===n))map[k]=i;
    }
  });

  if(map.name==null)throw new Error('A coluna de nome do cidadão não foi reconhecida.');

  const meta={};
  for(let i=0;i<headerIndex;i++){
    const first=normalize(rows[i][0]);
    if(first==='microarea')meta.microarea=cleanCell(rows[i][1]);
    if(first==='gerado em'){
      const date=cleanCell(rows[i][1]);
      const time=cleanCell(rows[i][3]);
      meta.generatedAt=[date,time].filter(Boolean).join(' ');
    }
    if(first.startsWith('unidade de saude')){
      meta.unit=cleanCell(rows[i][0]).replace(/^UNIDADE DE SAÚDE\s*/i,'').trim();
    }
  }

  const data=rows.slice(headerIndex+1)
    .filter(r=>r.some(Boolean)&&r[map.name])
    .map((r,idx)=>{
      const g=k=>map[k]==null?'':cleanCell(r[map[k]]);
      return{
        id:'row-'+idx,
        name:g('name'),
        birth:g('birth'),
        cpf:g('cpf'),
        cns:g('cns'),
        sex:g('sex'),
        streetType:g('streetType'),
        street:g('street'),
        number:g('number'),
        district:g('district'),
        reference:g('ref'),
        responsibleFlag:g('responsibleFlag'),
        responsibleId:g('responsibleId'),
        responsibleName:g('responsibleName'),
        lastVisit:g('lastVisit'),
        nextVisit:g('nextVisit'),
        raw:r
      };
    });

  const dateValues=[];
  for(const r of data.slice(0,1000)){
    if(r.birth)dateValues.push(r.birth);
    if(r.lastVisit)dateValues.push(r.lastVisit);
    if(r.nextVisit)dateValues.push(r.nextVisit);
  }
  if(meta.generatedAt)dateValues.push(meta.generatedAt);
  meta.dateFormat=detectDateFormat(dateValues);
  meta.hasVisitDate=map.lastVisit!=null||map.nextVisit!=null;

  return{delimiter:delim,headerIndex,header,map,data,meta};
}

export function parseDate(value){
  const s=cleanCell(value);
  if(!s||s==='-')return null;

  let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if(m){
    const[,d,mo,y]=m;
    const dt=new Date(+y,+mo-1,+d);
    return dt.getFullYear()==+y&&dt.getMonth()==+mo-1&&dt.getDate()==+d?dt:null;
  }

  m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if(m){
    const[,y,mo,d]=m;
    const dt=new Date(+y,+mo-1,+d);
    return dt.getFullYear()==+y&&dt.getMonth()==+mo-1&&dt.getDate()==+d?dt:null;
  }

  m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+.*)?$/);
  if(m){
    const[,d,mo,y]=m;
    const dt=new Date(+y,+mo-1,+d);
    return dt.getFullYear()==+y&&dt.getMonth()==+mo-1&&dt.getDate()==+d?dt:null;
  }

  return null;
}

export function formatDate(value){
  const d=value instanceof Date?value:parseDate(value);
  return d?new Intl.DateTimeFormat('pt-BR').format(d):'—';
}

export async function parseFile(file){
  const buf=await file.arrayBuffer();
  const{encoding,text}=decodeBuffer(buf);
  return{...parseText(text),encoding,fileName:file.name,size:file.size};
}
