const commonAliases={
  name:['nome cidadao','nome cidadão','nome','cidadao','cidadão'],
  birth:['data de nascimento','data nascimento','dt nascimento','nascimento'],
  cpf:['cpf'],
  cns:['cns','cartao sus','cartão sus'],
  sex:['sexo'],
  microarea:['microarea','microárea','microarea(s)','microárea(s)'],
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
  conditions:['condicoes de saude','condições de saúde','condicoes','condições','condição de saúde','condicao de saude']
};

const XLSX_CDN='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let xlsxLoader=null;

function mismatchMessage(actualType){
  if(actualType==='territory')return'Este arquivo foi reconhecido como Território. Selecione-o como Base 1.';
  if(actualType==='followup')return'Este arquivo foi reconhecido como Acompanhamentos. Selecione-o como Base 2.';
  return'O arquivo foi lido, mas o tipo de relatório não pôde ser identificado.';
}

export async function ensureXlsxLibrary(){
  if(globalThis.XLSX?.read&&globalThis.XLSX?.utils?.sheet_to_json)return globalThis.XLSX;
  if(typeof document==='undefined'){
    throw new Error('O leitor de Excel não está disponível neste ambiente.');
  }
  if(xlsxLoader)return xlsxLoader;

  xlsxLoader=new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-zela-xlsx]');
    let timer=null;

    const cleanup=()=>{
      if(timer)clearTimeout(timer);
    };
    const succeed=()=>{
      cleanup();
      if(globalThis.XLSX?.read&&globalThis.XLSX?.utils?.sheet_to_json){
        if(script)script.dataset.loaded='true';
        resolve(globalThis.XLSX);
        return;
      }
      if(script)script.remove();
      xlsxLoader=null;
      reject(new Error('O componente de leitura do Excel carregou de forma incompleta. Tente novamente.'));
    };
    const fail=()=>{
      cleanup();
      if(script)script.remove();
      xlsxLoader=null;
      reject(new Error('Não foi possível carregar o leitor de Excel. Verifique a conexão e tente novamente.'));
    };

    if(script){
      if(script.dataset.loaded==='true'){
        succeed();
        return;
      }
      script.addEventListener('load',succeed,{once:true});
      script.addEventListener('error',fail,{once:true});
    }else{
      script=document.createElement('script');
      script.src=XLSX_CDN;
      script.async=true;
      script.dataset.zelaXlsx='true';
      script.addEventListener('load',succeed,{once:true});
      script.addEventListener('error',fail,{once:true});
      document.head.append(script);
    }

    timer=setTimeout(fail,15000);
  });

  return xlsxLoader;
}

export const normalize=value=>String(value??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/\s+/g,' ')
  .trim()
  .toLowerCase();

export const normalizeHeader=value=>normalize(value)
  .replace(/[_-]+/g,' ')
  .replace(/[^a-z0-9/() ?]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

export const cleanCell=value=>{
  if(value instanceof Date)return value;
  return String(value??'')
    .replace(/^\ufeff/,'')
    .replace(/\t/g,'')
    .trim();
};

export function detectEncoding(buffer){
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return'utf-8';
  try{
    new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return'utf-8';
  }catch{
    return'windows-1252';
  }
}

export function decodeBuffer(buffer){
  const encoding=detectEncoding(buffer);
  return{text:new TextDecoder(encoding).decode(buffer),encoding};
}

function countDelimiter(line,delimiter){
  let count=0,quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"'){
      if(quoted&&line[i+1]==='"')i++;
      else quoted=!quoted;
    }else if(char===delimiter&&!quoted){
      count++;
    }
  }
  return count;
}

export function detectDelimiter(text){
  const lines=String(text??'').split(/\r?\n/).filter(line=>line.trim()).slice(0,40);
  const delimiters=[';',',','\t'];
  return delimiters.sort((a,b)=>
    lines.reduce((sum,line)=>sum+countDelimiter(line,b),0)-
    lines.reduce((sum,line)=>sum+countDelimiter(line,a),0)
  )[0]||';';
}

export function parseLine(line,delimiter){
  const output=[];
  let current='',quoted=false;
  for(let i=0;i<=line.length;i++){
    const char=line[i];
    if(i===line.length||(!quoted&&char===delimiter)){
      output.push(cleanCell(current));
      current='';
      continue;
    }
    if(char==='"'){
      if(quoted&&line[i+1]==='"'){
        current+='"';
        i++;
      }else{
        quoted=!quoted;
      }
    }else{
      current+=char;
    }
  }
  return output;
}

function excelSerialToDate(value){
  const serial=Number(value);
  if(!Number.isFinite(serial)||serial<=0||serial>2958465)return null;
  const utcMillis=Math.round((serial-25569)*86400000);
  const utc=new Date(utcMillis);
  if(Number.isNaN(utc.getTime()))return null;
  return new Date(utc.getUTCFullYear(),utc.getUTCMonth(),utc.getUTCDate());
}

export function parseDate(value){
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))return null;
    return new Date(value.getFullYear(),value.getMonth(),value.getDate());
  }
  if(typeof value==='number')return excelSerialToDate(value);

  const raw=String(value??'').trim();
  if(!raw||raw==='-')return null;
  if(/^\d+(?:[.,]\d+)?$/.test(raw)){
    const serial=excelSerialToDate(Number(raw.replace(',','.')));
    if(serial)return serial;
  }

  let match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if(match){
    const[,day,month,year]=match;
    const date=new Date(+year,+month-1,+day);
    return date.getFullYear()===+year&&date.getMonth()===+month-1&&date.getDate()===+day?date:null;
  }

  match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if(match){
    const[,year,month,day]=match;
    const date=new Date(+year,+month-1,+day);
    return date.getFullYear()===+year&&date.getMonth()===+month-1&&date.getDate()===+day?date:null;
  }

  match=raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+.*)?$/);
  if(match){
    const[,day,month,year]=match;
    const date=new Date(+year,+month-1,+day);
    return date.getFullYear()===+year&&date.getMonth()===+month-1&&date.getDate()===+day?date:null;
  }
  return null;
}

export function formatDate(value){
  const date=value instanceof Date?value:parseDate(value);
  return date?new Intl.DateTimeFormat('pt-BR').format(date):'—';
}

export function detectDateFormat(values){
  const formats=new Set();
  for(const value of values||[]){
    if(value instanceof Date){formats.add('Data do Excel');continue;}
    if(typeof value==='number'){formats.add('Serial do Excel');continue;}
    const text=String(value??'').trim();
    if(!text||text==='-')continue;
    if(/^\d{1,2}\/\d{1,2}\/\d{4}(?:\s|$)/.test(text))formats.add('DD/MM/AAAA');
    else if(/^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(text))formats.add('AAAA-MM-DD');
    else if(/^\d{1,2}-\d{1,2}-\d{4}(?:\s|$)/.test(text))formats.add('DD-MM-AAAA');
    else if(/^\d+(?:[.,]\d+)?$/.test(text)&&parseDate(text))formats.add('Serial do Excel');
  }
  if(!formats.size)return'não identificado';
  if(formats.size===1)return[...formats][0];
  return'misto: '+[...formats].join(' + ');
}

function buildMap(header,aliases){
  const map={};
  const normalized=header.map(normalizeHeader);
  for(const[key,variants]of Object.entries(aliases)){
    const targets=variants.map(normalizeHeader);
    const index=normalized.findIndex(item=>targets.includes(item));
    if(index>=0)map[key]=index;
  }
  return map;
}

function scoreHeader(row,aliases){
  const normalized=row.map(normalizeHeader);
  let score=0;
  for(const variants of Object.values(aliases)){
    if(variants.some(variant=>normalized.includes(normalizeHeader(variant))))score++;
  }
  return score;
}

function detectReportType(header){
  const normalized=header.map(normalizeHeader);
  const visitDays=normalizeHeader('Dias desde a última visita domiciliar');
  const visitMonths=normalizeHeader('Meses desde a última visita domiciliar');
  if(normalized.includes(visitDays)||normalized.includes(visitMonths))return'followup';
  if(normalized.includes(normalizeHeader('NOME DO RESPONSÁVEL FAMILIAR'))||normalized.includes(normalizeHeader('É O RESPONSÁVEL FAMILIAR?')))return'territory';
  return'unknown';
}

function metaPair(row){
  const first=String(row[0]??'');
  if(first.includes(';')){
    const parsed=parseLine(first,';');
    return[parsed[0]??'',parsed[1]??'',parsed[2]??'',parsed[3]??'',...row.slice(1)];
  }
  return row;
}

function extractMeta(rows,headerIndex,reportType){
  const meta={reportType};
  for(let i=0;i<headerIndex;i++){
    const row=metaPair(rows[i].map(cleanCell));
    const first=normalizeHeader(row[0]);
    if(!first)continue;
    if(first==='microarea'||first==='microarea s'||first==='microarea(s)')meta.microarea=String(cleanCell(row[1]));
    if(first.startsWith('equipe responsavel'))meta.team=String(cleanCell(row[1]));
    if(first==='lista tematica')meta.listTheme=String(cleanCell(row[1]));
    if(first==='periodo do ultimo atendimento')meta.period=String(cleanCell(row[1]));
    if(first==='gerado em'){
      const date=cleanCell(row[1]);
      const time=cleanCell(row[3]);
      meta.generatedDate=date;
      meta.generatedAt=[date,time].filter(Boolean).join(' ');
    }
    if(first.includes('relatorio gerado a partir do acompanhamento de condicoes de saude'))meta.reportTitle=String(cleanCell(row[0]));
    if(first.includes('acompanhamento do territorio'))meta.reportTitle=String(cleanCell(row[0]));
    if(first.startsWith('unidade de saude'))meta.unit=String(cleanCell(row[0])).replace(/^UNIDADE DE SAÚDE\s*/i,'').trim();
  }
  return meta;
}

function rowValue(row,map,key){
  if(map[key]==null)return'';
  return cleanCell(row[map[key]]);
}

function isUsableName(value){
  const normalized=normalize(value);
  return Boolean(normalized&&normalized!=='-'&&normalized!=='nao informado'&&normalized!=='sem informacao');
}

function standardizeRow(row,map,reportType,index,meta){
  const base={
    id:reportType+'-'+index,
    source:reportType,
    name:String(rowValue(row,map,'name')||''),
    birth:rowValue(row,map,'birth'),
    cpf:String(rowValue(row,map,'cpf')||''),
    cns:String(rowValue(row,map,'cns')||''),
    sex:String(rowValue(row,map,'sex')||''),
    microarea:String(rowValue(row,map,'microarea')||meta.microarea||''),
    streetType:String(rowValue(row,map,'streetType')||''),
    street:String(rowValue(row,map,'street')||''),
    number:String(rowValue(row,map,'number')||''),
    complement:String(rowValue(row,map,'complement')||''),
    district:String(rowValue(row,map,'district')||''),
    city:String(rowValue(row,map,'city')||''),
    state:String(rowValue(row,map,'state')||''),
    zip:String(rowValue(row,map,'zip')||''),
    phoneMobile:String(rowValue(row,map,'phoneMobile')||''),
    phoneHome:String(rowValue(row,map,'phoneHome')||''),
    phoneContact:String(rowValue(row,map,'phoneContact')||'')
  };

  if(reportType==='territory'){
    return{
      ...base,
      reference:String(rowValue(row,map,'reference')||''),
      responsibleFlag:String(rowValue(row,map,'responsibleFlag')||''),
      responsibleId:String(rowValue(row,map,'responsibleId')||''),
      responsibleName:String(rowValue(row,map,'responsibleName')||'')
    };
  }

  return{
    ...base,
    ageText:String(rowValue(row,map,'ageText')||''),
    genderIdentity:String(rowValue(row,map,'genderIdentity')||''),
    race:String(rowValue(row,map,'race')||''),
    bolsa:String(rowValue(row,map,'bolsa')||''),
    bolsaValidity:String(rowValue(row,map,'bolsaValidity')||''),
    medicalDays:String(rowValue(row,map,'medicalDays')||''),
    medicalMonths:String(rowValue(row,map,'medicalMonths')||''),
    nursingDays:String(rowValue(row,map,'nursingDays')||''),
    nursingMonths:String(rowValue(row,map,'nursingMonths')||''),
    dentalDays:String(rowValue(row,map,'dentalDays')||''),
    dentalMonths:String(rowValue(row,map,'dentalMonths')||''),
    visitDays:String(rowValue(row,map,'visitDays')||''),
    visitMonths:String(rowValue(row,map,'visitMonths')||''),
    weight:String(rowValue(row,map,'weight')||''),
    height:String(rowValue(row,map,'height')||''),
    weightHeightDate:rowValue(row,map,'weightHeightDate'),
    bloodPressure:String(rowValue(row,map,'bloodPressure')||''),
    bloodPressureDate:rowValue(row,map,'bloodPressureDate'),
    followupStatus:String(rowValue(row,map,'status')||''),
    conditions:String(rowValue(row,map,'conditions')||'')
  };
}

export function parseRows(rows){
  const normalizedRows=(rows||[]).map(row=>(Array.isArray(row)?row:[row]).map(cleanCell));
  let headerIndex=-1,bestScore=0;
  normalizedRows.forEach((row,index)=>{
    const expanded=row.length===1&&String(row[0]??'').includes(';')?parseLine(String(row[0]),';'):row;
    const score=Math.max(scoreHeader(expanded,territoryAliases),scoreHeader(expanded,followupAliases));
    if(score>bestScore&&expanded.filter(Boolean).length>=4){
      bestScore=score;
      headerIndex=index;
    }
  });
  if(headerIndex<0)throw new Error('Não foi possível localizar a linha de cabeçalho do relatório do e-SUS.');

  let header=normalizedRows[headerIndex];
  if(header.length===1&&String(header[0]??'').includes(';'))header=parseLine(String(header[0]),';');
  const reportType=detectReportType(header);
  if(reportType==='unknown')throw new Error('O arquivo foi lido, mas não corresponde aos relatórios Território ou Acompanhamentos / Condições de saúde reconhecidos pelo Zela.');

  const aliases=reportType==='territory'?territoryAliases:followupAliases;
  const map=buildMap(header,aliases);
  if(map.name==null)throw new Error('A coluna de nome do cidadão não foi reconhecida.');
  if(map.cpf==null&&map.cns==null)throw new Error('Nenhuma coluna CPF ou CNS foi reconhecida; o cruzamento seguro não pode ser feito.');
  if(reportType==='followup'&&map.visitDays==null&&map.visitMonths==null){
    throw new Error('O relatório de acompanhamento foi reconhecido, mas não contém “Dias” nem “Meses desde a última visita domiciliar”.');
  }

  const meta=extractMeta(normalizedRows,headerIndex,reportType);
  const data=[];
  let recordsRead=0;
  for(let index=headerIndex+1;index<normalizedRows.length;index++){
    let row=normalizedRows[index];
    if(row.length===1&&String(row[0]??'').includes(';'))row=parseLine(String(row[0]),';');
    if(!row.some(Boolean))continue;
    const name=rowValue(row,map,'name');
    if(!name)continue;
    recordsRead++;
    if(!isUsableName(name))continue;
    data.push(standardizeRow(row,map,reportType,data.length,meta));
  }

  const dateValues=[];
  for(const row of data.slice(0,1000)){
    if(row.birth)dateValues.push(row.birth);
    if(row.weightHeightDate)dateValues.push(row.weightHeightDate);
    if(row.bloodPressureDate)dateValues.push(row.bloodPressureDate);
  }
  if(meta.generatedAt)dateValues.push(meta.generatedAt);
  meta.dateFormat=detectDateFormat(dateValues);
  meta.recordsRead=recordsRead;
  meta.validRecords=data.length;
  meta.invalidRecords=Math.max(0,recordsRead-data.length);
  meta.hasVisitElapsed=reportType==='followup'&&(map.visitDays!=null||map.visitMonths!=null);
  meta.hasConditions=map.conditions!=null;
  meta.recognizedColumns=Object.entries(map).map(([field,index])=>({field,column:String(header[index]??'')}));

  return{headerIndex,header,map,data,meta,reportType,score:bestScore};
}

export function parseText(text){
  const delimiter=detectDelimiter(text);
  const rows=String(text??'').split(/\r?\n/).filter(line=>line.trim()).map(line=>parseLine(line,delimiter));
  return{...parseRows(rows),delimiter};
}

export function workbookMatrixToRows(matrix){
  const rows=(matrix||[]).map(row=>Array.isArray(row)?row:[]);

  return rows.map(row=>{
    let last=row.length-1;
    while(last>=0&&(row[last]==null||String(row[last]).trim()===''))last--;
    if(last<0)return[];

    const trimmed=row.slice(0,last+1);
    const firstNonEmpty=trimmed.find(value=>value!=null&&String(value).trim()!=='');
    const embeddedDelimited=firstNonEmpty!=null&&countDelimiter(String(firstNonEmpty),';')>=4;
    if(!embeddedDelimited)return trimmed;

    const reconstructed=trimmed.map(value=>{
      if(value instanceof Date)return formatDate(value);
      return String(value??'').trim();
    }).join(',');
    return parseLine(reconstructed,';');
  });
}

function parseWorkbook(workbook,expectedType){
  const candidates=[];
  const failures=[];
  for(const sheetName of workbook.SheetNames||[]){
    try{
      const matrix=globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{
        header:1,
        raw:false,
        defval:'',
        dateNF:'dd/mm/yyyy'
      });
      const parsed=parseRows(workbookMatrixToRows(matrix));
      candidates.push({...parsed,sheetName});
    }catch(error){
      failures.push({sheetName,message:error?.message||String(error)});
    }
  }
  if(!candidates.length){
    throw new Error(failures[0]?.message||'A planilha não possui uma aba compatível com os relatórios do e-SUS.');
  }

  candidates.sort((a,b)=>b.data.length-a.data.length||b.score-a.score);
  if(expectedType){
    const compatible=candidates.filter(candidate=>candidate.reportType===expectedType);
    if(!compatible.length)throw new Error(mismatchMessage(candidates[0].reportType));
    return compatible[0];
  }
  return candidates[0];
}

export async function parseFile(file,expectedType=''){
  if(!file)throw new Error('Nenhum arquivo foi selecionado.');
  const name=String(file.name||'').toLowerCase();
  const supported=name.endsWith('.csv')||name.endsWith('.xls')||name.endsWith('.xlsx');
  if(!supported)throw new Error('Formato não suportado. Use um arquivo .csv, .xls ou .xlsx exportado pelo e-SUS.');

  const buffer=await file.arrayBuffer();
  if(name.endsWith('.xls')||name.endsWith('.xlsx')){
    const XLSX=await ensureXlsxLibrary();
    let workbook;
    try{
      workbook=XLSX.read(buffer,{type:'array',cellDates:true});
    }catch{
      throw new Error('Não foi possível abrir esta planilha do Excel. Confirme se o arquivo não está corrompido e foi exportado pelo e-SUS.');
    }
    const parsed=parseWorkbook(workbook,expectedType);
    return{
      ...parsed,
      encoding:'Excel',
      delimiter:'—',
      fileName:file.name,
      size:file.size
    };
  }

  const{encoding,text}=decodeBuffer(buffer);
  const parsed=parseText(text);
  if(expectedType&&parsed.reportType!==expectedType){
    throw new Error(mismatchMessage(parsed.reportType));
  }
  return{...parsed,encoding,fileName:file.name,size:file.size};
}
