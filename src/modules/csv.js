const commonAliases={
  name:['nome cidadao','nome cidadão','nome','cidadao','cidadão'],
  birth:['data de nascimento','data nascimento','dt nascimento','nascimento'],
  cpf:['cpf'],
  cns:['cns','cartao sus','cartão sus'],
  sex:['sexo'],
  microarea:['microarea','microárea'],
  streetType:['tipo de logradouro','tipo logradouro'],
  street:['logradouro','rua'],
  number:['numero','número','nro'],
  complement:['complemento'],
  district:['bairro'],
  city:['municipio','município'],
  state:['uf'],
  zip:['cep'],
  phoneMobile:['telefone celular'],
  phoneHome:['telefone residencial'],
  phoneContact:['telefone de contato']
};

const territoryAliases={
  ...commonAliases,
  reference:['ponto de referencia','ponto de referência'],
  responsibleFlag:['e o responsavel familiar?','é o responsável familiar?','responsavel familiar?'],
  responsibleId:['cpf/cns responsavel familiar','cpf/cns responsável familiar'],
  responsibleName:['nome do responsavel familiar','nome do responsável familiar']
};

const followupAliases={
  ...commonAliases,
  ageText:['idade'],
  genderIdentity:['identidade de genero','identidade de gênero'],
  race:['raca/cor','raça/cor'],
  bolsa:['beneficiario do programa bolsa familia','beneficiário do programa bolsa família'],
  bolsaValidity:['vigencia do programa bolsa familia','vigência do programa bolsa família'],
  medicalDays:['dias desde o ultimo atendimento medico','dias desde o último atendimento médico'],
  medicalMonths:['meses desde o ultimo atendimento medico','meses desde o último atendimento médico'],
  nursingDays:['dias desde o ultimo atendimento de enfermagem','dias desde o último atendimento de enfermagem'],
  nursingMonths:['meses desde o ultimo atendimento de enfermagem','meses desde o último atendimento de enfermagem'],
  dentalDays:['dias desde o ultimo atendimento odontologico','dias desde o último atendimento odontológico'],
  dentalMonths:['meses desde o ultimo atendimento odontologico','meses desde o último atendimento odontológico'],
  visitDays:['dias desde a ultima visita domiciliar','dias desde a última visita domiciliar'],
  visitMonths:['meses desde a ultima visita domiciliar','meses desde a última visita domiciliar'],
  weight:['ultima medicao de peso','última medição de peso'],
  height:['ultima medicao de altura','última medição de altura'],
  weightHeightDate:['data da ultima medicao de peso e altura','data da última medição de peso e altura'],
  bloodPressure:['ultima medicao de pressao arterial','última medição de pressão arterial'],
  bloodPressureDate:['data da ultima medicao de pressao arterial','data da última medição de pressão arterial'],
  status:['situacao de acompanhamento','situação de acompanhamento','situacao','situação'],
  conditions:['condicoes de saude','condições de saúde','condicoes','condições']
};

export const normalize=s=>String(s??'')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g,'')
  .replace(/s+/g,' ')
  .trim()
  .toLowerCase();

export const normalizeHeader=s=>normalize(s)
  .replace(/[_-]+/g,' ')
  .replace(/[^a-z0-9/ ]+/g,' ')
  .replace(/s+/g,' ')
  .trim();

export const cleanCell=v=>String(v??'')
  .replace(/^﻿/,'')
  .replace(/	/g,'')
  .trim();

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
  const lines=text.split(/?
/).filter(Boolean).slice(0,40);
  const ds=[';',',','	'];
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
    if(/^d{1,2}/d{1,2}/d{4}(?:s|$)/.test(s))formats.add('DD/MM/AAAA');
    else if(/^d{4}-d{2}-d{2}(?:[Ts]|$)/.test(s))formats.add('AAAA-MM-DD');
    else if(/^d{1,2}-d{1,2}-d{4}(?:s|$)/.test(s))formats.add('DD-MM-AAAA');
  }
  if(formats.size===0)return'não identificado';
  if(formats.size===1)return[...formats][0];
  return'misto: '+[...formats].join(' + ');
}

export function parseDate(value){
  const s=cleanCell(value);
  if(!s||s==='-')return null;
  let m=s.match(/^(d{1,2})/(d{1,2})/(d{4})(?:s+.*)?$/);
  if(m){
    const[,d,mo,y]=m; const date=new Date(+y,+mo-1,+d);
    return date.getFullYear()===+y&&date.getMonth()===+mo-1&&date.getDate()===+d?date:null;
  }
  m=s.match(/^(d{4})-(d{2})-(d{2})(?:[Ts].*)?$/);
  if(m){
    const[,y,mo,d]=m; const date=new Date(+y,+mo-1,+d);
    return date.getFullYear()===+y&&date.getMonth()===+mo-1&&date.getDate()===+d?date:null;
  }
  m=s.match(/^(d{1,2})-(d{1,2})-(d{4})(?:s+.*)?$/);
  if(m){
    const[,d,mo,y]=m; const date=new Date(+y,+mo-1,+d);
    return date.getFullYear()===+y&&date.getMonth()===+mo-1&&date.getDate()===+d?date:null;
  }
  return null;
}

export function formatDate(value){
  const d=value instanceof Date?value:parseDate(value);
  return d?new Intl.DateTimeFormat('pt-BR').format(d):'—';
}

function buildMap(header,aliases){
  const map={};
  const normalized=header.map(normalizeHeader);
  for(const[k,variants]of Object.entries(aliases)){
    const targets=variants.map(normalizeHeader);
    const index=normalized.findIndex(h=>targets.includes(h));
    if(index>=0)map[k]=index;
  }
  return map;
}

function scoreHeader(row,aliases){
  const normalized=row.map(normalizeHeader);
  let score=0;
  for(const variants of Object.values(aliases)){
    if(variants.some(v=>normalized.includes(normalizeHeader(v))))score++;
  }
  return score;
}

function detectReportType(header){
  const h=header.map(normalizeHeader);
  if(h.includes(normalizeHeader('Dias desde a última visita domiciliar'))||h.includes(normalizeHeader('Meses desde a última visita domiciliar')))return'followup';
  if(h.includes(normalizeHeader('NOME DO RESPONSÁVEL FAMILIAR'))||h.includes(normalizeHeader('É O RESPONSÁVEL FAMILIAR?')))return'territory';
  return'unknown';
}

function extractMeta(rows,headerIndex,reportType){
  const meta={reportType};
  for(let i=0;i<headerIndex;i++){
    const row=rows[i].map(cleanCell);
    const first=normalizeHeader(row[0]);
    if(!first)continue;
    if(first==='microarea'||first==='microarea s')meta.microarea=cleanCell(row[1]);
    if(first==='lista tematica')meta.listTheme=cleanCell(row[1]);
    if(first==='periodo do ultimo atendimento')meta.period=cleanCell(row[1]);
    if(first==='gerado em'){
      const date=cleanCell(row[1]);
      const time=cleanCell(row[3]);
      meta.generatedDate=date;
      meta.generatedAt=[date,time].filter(Boolean).join(' ');
    }
    if(first.includes('relatorio gerado a partir do acompanhamento de condicoes de saude'))meta.reportTitle=cleanCell(row[0]);
    if(first.includes('acompanhamento do territorio'))meta.reportTitle=cleanCell(row[0]);
    if(first.startsWith('unidade de saude'))meta.unit=cleanCell(row[0]).replace(/^UNIDADE DE SAÚDEs*/i,'').trim();
  }
  return meta;
}

function rowValue(row,map,key){return map[key]==null?'':cleanCell(row[map[key]]);}

function standardizeRow(row,map,reportType,index){
  const base={
    id:reportType+'-'+index,
    source:reportType,
    name:rowValue(row,map,'name'),
    birth:rowValue(row,map,'birth'),
    cpf:rowValue(row,map,'cpf'),
    cns:rowValue(row,map,'cns'),
    sex:rowValue(row,map,'sex'),
    microarea:rowValue(row,map,'microarea'),
    streetType:rowValue(row,map,'streetType'),
    street:rowValue(row,map,'street'),
    number:rowValue(row,map,'number'),
    complement:rowValue(row,map,'complement'),
    district:rowValue(row,map,'district'),
    city:rowValue(row,map,'city'),
    state:rowValue(row,map,'state'),
    zip:rowValue(row,map,'zip'),
    phoneMobile:rowValue(row,map,'phoneMobile'),
    phoneHome:rowValue(row,map,'phoneHome'),
    phoneContact:rowValue(row,map,'phoneContact')
  };
  if(reportType==='territory'){
    return{
      ...base,
      reference:rowValue(row,map,'reference'),
      responsibleFlag:rowValue(row,map,'responsibleFlag'),
      responsibleId:rowValue(row,map,'responsibleId'),
      responsibleName:rowValue(row,map,'responsibleName')
    };
  }
  if(reportType==='followup'){
    return{
      ...base,
      ageText:rowValue(row,map,'ageText'),
      genderIdentity:rowValue(row,map,'genderIdentity'),
      race:rowValue(row,map,'race'),
      bolsa:rowValue(row,map,'bolsa'),
      bolsaValidity:rowValue(row,map,'bolsaValidity'),
      medicalDays:rowValue(row,map,'medicalDays'),
      medicalMonths:rowValue(row,map,'medicalMonths'),
      nursingDays:rowValue(row,map,'nursingDays'),
      nursingMonths:rowValue(row,map,'nursingMonths'),
      dentalDays:rowValue(row,map,'dentalDays'),
      dentalMonths:rowValue(row,map,'dentalMonths'),
      visitDays:rowValue(row,map,'visitDays'),
      visitMonths:rowValue(row,map,'visitMonths'),
      weight:rowValue(row,map,'weight'),
      height:rowValue(row,map,'height'),
      weightHeightDate:rowValue(row,map,'weightHeightDate'),
      bloodPressure:rowValue(row,map,'bloodPressure'),
      bloodPressureDate:rowValue(row,map,'bloodPressureDate'),
      followupStatus:rowValue(row,map,'status'),
      conditions:rowValue(row,map,'conditions')
    };
  }
  return base;
}

export function parseRows(rows){
  const cleanRows=rows.map(r=>r.map(cleanCell));
  let headerIndex=-1,best=0;
  cleanRows.forEach((row,i)=>{
    const score=Math.max(scoreHeader(row,territoryAliases),scoreHeader(row,followupAliases));
    if(score>best&&row.filter(Boolean).length>=4){best=score;headerIndex=i;}
  });
  if(headerIndex<0)throw new Error('Não foi possível localizar a linha de cabeçalho do relatório do e-SUS.');

  const header=cleanRows[headerIndex];
  const reportType=detectReportType(header);
  if(reportType==='unknown'){
    throw new Error('O arquivo foi lido, mas não corresponde aos relatórios Território ou Acompanhamentos / Condições de saúde reconhecidos pelo Zela.');
  }
  const aliases=reportType==='territory'?territoryAliases:followupAliases;
  const map=buildMap(header,aliases);
  if(map.name==null)throw new Error('A coluna de nome do cidadão não foi reconhecida.');
  if(map.cpf==null&&map.cns==null)throw new Error('Nenhuma coluna CPF ou CNS foi reconhecida; o cruzamento seguro não pode ser feito.');
  if(reportType==='followup'&&map.visitDays==null&&map.visitMonths==null){
    throw new Error('O relatório de acompanhamento foi reconhecido, mas não contém “Dias” nem “Meses desde a última visita domiciliar”.');
  }

  const data=cleanRows.slice(headerIndex+1)
    .filter(r=>r.some(Boolean)&&rowValue(r,map,'name'))
    .map((r,idx)=>standardizeRow(r,map,reportType,idx));
  const meta=extractMeta(cleanRows,headerIndex,reportType);
  const dateValues=[];
  for(const r of data.slice(0,1000)){
    if(r.birth)dateValues.push(r.birth);
    if(r.weightHeightDate)dateValues.push(r.weightHeightDate);
    if(r.bloodPressureDate)dateValues.push(r.bloodPressureDate);
  }
  if(meta.generatedAt)dateValues.push(meta.generatedAt);
  meta.dateFormat=detectDateFormat(dateValues);
  meta.hasVisitElapsed=reportType==='followup'&&(map.visitDays!=null||map.visitMonths!=null);
  meta.recognizedColumns=Object.entries(map).map(([field,index])=>({field,column:header[index]}));

  return{headerIndex,header,map,data,meta,reportType};
}

export function parseText(text){
  const delimiter=detectDelimiter(text);
  const rows=text.split(/?
/).filter(line=>line.trim()).map(line=>parseLine(line,delimiter));
  return{...parseRows(rows),delimiter};
}

function workbookMatrixToRows(matrix){
  const rows=(matrix||[]).map(row=>Array.isArray(row)?row:[]);
  const semicolonRich=rows.slice(0,40).some(row=>row.some(cell=>String(cell??'').includes(';')));
  if(!semicolonRich)return rows.map(row=>row.map(cleanCell));
  return rows.map(row=>{
    let last=row.length-1;
    while(last>=0&&(row[last]==null||String(row[last]).trim()===''))last--;
    if(last<0)return[];
    // O XLSX real do e-SUS pode trazer decimais brasileiros separados em células (ex.: 82 | 00;158 | 00).
    // Reunir as células com vírgula restaura a linha semicolon-delimited original antes do parsing.
    const reconstructed=row.slice(0,last+1).map(v=>cleanCell(v)).join(',');
    return parseLine(reconstructed,';');
  });
}

export async function parseFile(file){
  const name=String(file?.name||'').toLowerCase();
  const buffer=await file.arrayBuffer();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){
    if(!globalThis.XLSX?.read)throw new Error('O leitor de Excel ainda não carregou. Verifique a conexão e tente novamente.');
    const workbook=globalThis.XLSX.read(buffer,{type:'array',raw:false,cellDates:false});
    const sheetName=workbook.SheetNames?.[0];
    if(!sheetName)throw new Error('A planilha não possui uma aba legível.');
    const matrix=globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:false,defval:''});
    const rows=workbookMatrixToRows(matrix);
    return{...parseRows(rows),encoding:'XLSX',delimiter:';',fileName:file.name,size:file.size};
  }
  const{encoding,text}=decodeBuffer(buffer);
  return{...parseText(text),encoding,fileName:file.name,size:file.size};
}
