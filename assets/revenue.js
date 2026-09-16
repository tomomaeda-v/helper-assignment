const REVENUE_CATEGORIES = [
  {key:"care",label:"介護",color:"#e34c4c"},
  {key:"disability",label:"障害",color:"#4963df"},
  {key:"general",label:"総合事業",color:"#8b5cf6"},
  {key:"mobility",label:"移動支援",color:"#1a9d72"},
  {key:"private",label:"自費",color:"#f2c94c"}
];
const REVENUE_OFFICES = ["用賀","二子玉川"];
const REVENUE_UNIT_RATES = {care:11.4,disability:11.2,general:11.4};
const REVENUE_SPECIAL_ADDITION_RATES = {"用賀":{disability:0.1}};
const REVENUE_TREATMENT_RATES = {
  care:{legacy:0.245,iRo:0.287},
  general:{legacy:0.245,iRo:0.287},
  disability:{
    home:{legacy:0.417,iRo:0.456},
    severeVisit:{legacy:0.343,iRo:0.382},
    accompanying:{legacy:0.417,iRo:0.456},
    behavioral:{legacy:0.382,iRo:0.421}
  }
};
let revenueFrom="", revenueTo="", revenueDemo=false, revenueImportStatus="";

function revenueMonth(value){
  const s=String(value||"").normalize("NFKC").trim().replace(/[\/.]/g,"-");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&s.slice(0,4)!=="0000"?s:"";
}
function shiftRevenueMonth(month,offset){
  if(!revenueMonth(month))return "";
  const [year,m]=month.split("-").map(Number), index=year*12+m-1+offset;
  return String(Math.floor(index/12)).padStart(4,"0")+"-"+String((index%12+12)%12+1).padStart(2,"0");
}
function revenueMonths(from,to){
  if(!revenueMonth(from)||!revenueMonth(to)||from>to)return [];
  const months=[];
  for(let m=from;m<=to;m=shiftRevenueMonth(m,1)){
    if(months.length===12)return [];
    months.push(m);
  }
  return months;
}
function normalizeRevenueRecords(records){
  const unique=new Map();
  for(const row of Array.isArray(records)?records:[]){
    const month=revenueMonth(row?.month);
    if(!row||!month||!REVENUE_OFFICES.includes(row.office))continue;
    const amounts={};
    for(const category of REVENUE_CATEGORIES){
      const n=row.amounts?.[category.key];
      amounts[category.key]=typeof n==="number"&&Number.isSafeInteger(n)&&n>=0?n:null;
    }
    const sourceRows=Number.isSafeInteger(row.meta?.sourceRows)&&row.meta.sourceRows>=0?row.meta.sourceRows:0;
    unique.set(row.office+"|"+month,{office:row.office,month,amounts,meta:{sourceRows}});
  }
  return [...unique.values()];
}
function revenueSampleRecords(){
  const rows=[
    ["2026-07","用賀",2000000,2050000,300000,1100000,550000],
    ["2026-07","二子玉川",900000,850000,200000,650000,400000],
    ["2026-08","用賀",1400000,1550000,200000,1500000,550000],
    ["2026-08","二子玉川",300000,550000,100000,1000000,650000]
  ];
  return rows.map(([month,office,...values])=>({month,office,amounts:Object.fromEntries(REVENUE_CATEGORIES.map((c,i)=>[c.key,values[i]]))}));
}
function summarizeRevenue(records,months,office){
  const offices=office==="all"?REVENUE_OFFICES:[office];
  return months.map(month=>{
    const rows=records.filter(r=>r.month===month&&offices.includes(r.office));
    const amounts={},categoryComplete={};
    for(const {key} of REVENUE_CATEGORIES){
      const values=rows.map(r=>r.amounts[key]).filter(v=>v!==null);
      amounts[key]=values.length?values.reduce((sum,n)=>sum+n,0):null;
      categoryComplete[key]=values.length===offices.length;
    }
    const values=Object.values(amounts).filter(v=>v!==null);
    return {month,amounts,categoryComplete,total:values.length?values.reduce((sum,n)=>sum+n,0):null,
      complete:Object.values(categoryComplete).every(Boolean),officeCount:rows.length,expectedOffices:offices.length};
  });
}
function revenueDifference(current,previous){
  if(!current?.complete||!previous?.complete||shiftRevenueMonth(previous.month,1)!==current.month)return null;
  const amount=current.total-previous.total;
  return {amount,percent:previous.total===0?null:amount/previous.total*100};
}
function revenueAxisMax(max){
  if(max<=0)return 1000000;
  const magnitude=10**Math.floor(Math.log10(max/4));
  const step=[1,2,2.5,5,10].map(n=>n*magnitude).find(n=>n*4>=max);
  return step*4;
}
function revenueYen(n){return n===null?"未集計":n.toLocaleString("ja-JP")+"円";}
function revenueMan(n){return (n/10000).toLocaleString("ja-JP",{maximumFractionDigits:2});}
function revenueMonthLabel(month){const [y,m]=month.split("-");return `${y}年${Number(m)}月`;}
function revenueDiffLabel(diff){
  if(!diff)return "前月比 —";
  const sign=diff.amount>0?"+":diff.amount<0?"−":"";
  return `前月比 ${sign}${revenueMan(Math.abs(diff.amount))}万円${diff.percent===null?"":` (${diff.percent>0?"+":""}${diff.percent.toFixed(1)}%)`}`;
}
function revenueLegend(){return REVENUE_CATEGORIES.map(c=>`<span><i class="rev-swatch" style="--category-color:${c.color}"></i>${c.label}</span>`).join("");}
function revenueChart(months){
  const max=revenueAxisMax(Math.max(0,...months.map(m=>m.total||0)));
  const ticks=Array.from({length:5},(_,i)=>i*25);
  const axis=ticks.map(p=>`<span style="bottom:${p}%">${revenueMan(max*p/100)}</span>`).join("");
  const grid=ticks.slice(1).map(p=>`<span style="bottom:${p}%"></span>`).join("");
  const columns=months.map((m,index)=>{
    const height=(m.total||0)/max*100;
    const segments=REVENUE_CATEGORIES.filter(c=>m.amounts[c.key]>0).map(c=>{
      const amount=m.amounts[c.key],h=amount/max*100;
      return `<div class="rev-segment rev-${c.key}" style="--segment-height:${h}%;--category-color:${c.color}" title="${revenueMonthLabel(m.month)} ${c.label} ${revenueYen(amount)}${m.categoryComplete[c.key]?"":"（一部未集計）"}">${h>=9?`<span>${revenueMan(amount)}</span>`:""}</div>`;
    }).join("");
    const diff=revenueDifference(m,months[index-1]);
    const [year,month]=m.month.split("-");
    return `<div class="rev-column"><div class="rev-stack">${segments}${m.total===null?'<span class="rev-no-data">未集計</span>':`<span class="rev-column-total" style="--total-height:${height}%">${revenueMan(m.total)}万円${m.complete?"":"*"}</span>`}</div><div class="rev-month"><span class="rev-year">${year}</span>${Number(month)}月</div><div class="rev-change ${diff?.amount>0?"rev-up":diff?.amount<0?"rev-down":""}">${m.total!==null&&!m.complete?"* 一部未集計":revenueDiffLabel(diff)}</div></div>`;
  }).join("");
  return `<div class="rev-chart-frame" role="img" aria-label="月別売上の積み上げ棒グラフ。下から介護、障害、総合事業、移動支援、自費。金額の詳細は下の表にあります。"><div class="rev-axis" aria-hidden="true">${axis}</div><div class="rev-chart-scroll"><div class="rev-plot"><div class="rev-grid" aria-hidden="true">${grid}</div>${columns}</div></div></div>`;
}
function revenueTable(months){
  const header=REVENUE_CATEGORIES.map(c=>`<th scope="col"><i class="rev-swatch" style="--category-color:${c.color}"></i>${c.label}</th>`).join("");
  const rows=months.map((m,i)=>{
    const cells=REVENUE_CATEGORIES.map(c=>`<td>${revenueYen(m.amounts[c.key])}${m.amounts[c.key]!==null&&!m.categoryComplete[c.key]?"*":""}</td>`).join("");
    const diff=revenueDifference(m,months[i-1]);
    return `<tr><th scope="row">${revenueMonthLabel(m.month)}</th>${cells}<td class="rev-total-cell">${revenueYen(m.total)}${m.total!==null&&!m.complete?"*":""}</td><td class="${diff?.amount>0?"rev-up":diff?.amount<0?"rev-down":""}">${diff?(diff.amount>0?"+":"")+revenueYen(diff.amount):"—"}</td></tr>`;
  }).join("");
  return `<div class="rev-table-scroll"><table class="rev-table"><caption>月別・サービス区分別の売上概算（円）</caption><thead><tr><th scope="col">月</th>${header}<th scope="col">合計</th><th scope="col">前月との差</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function revenueNumber(value){
  const s=String(value??"").normalize("NFKC").replace(/[\s,，￥¥円]/g,"");
  if(!s)return null;
  const n=Number(s);
  return Number.isFinite(n)?n:null;
}
function revenueCategory(classification,serviceName,serviceKind,serviceItem="",groupName=""){
  const text=`${classification||""} ${serviceName||""} ${serviceKind||""} ${serviceItem||""} ${groupName||""}`.normalize("NFKC");
  if(/移動支援|移動介護|外出支援|ガイドヘルプ|ガイドヘルパー/.test(text))return "mobility";
  if(/自費|保険外/.test(text))return "private";
  if(/障害|居宅介護|重度訪問|同行援護|行動援護/.test(text))return "disability";
  if(/総合事業|訪問型/.test(text)||/^A2$/i.test(String(serviceKind||"").trim()))return "general";
  if(/介護/.test(text)||/^11$/i.test(String(serviceKind||"").trim()))return "care";
  return "";
}
function revenueTreatmentRate(category,serviceText,month){
  const current=revenueMonth(month)>="2026-06", period=current?"iRo":"legacy";
  if(category==="care"||category==="general")return REVENUE_TREATMENT_RATES[category][period];
  if(category!=="disability")return 0;
  const text=String(serviceText||"").normalize("NFKC");
  if(/重度訪問/.test(text))return REVENUE_TREATMENT_RATES.disability.severeVisit[period];
  if(/行動援護/.test(text))return REVENUE_TREATMENT_RATES.disability.behavioral[period];
  if(/同行援護/.test(text))return REVENUE_TREATMENT_RATES.disability.accompanying[period];
  return REVENUE_TREATMENT_RATES.disability.home[period];
}
function revenueSpecialAdditionRate(office,category){return REVENUE_SPECIAL_ADDITION_RATES[office]?.[category]||0;}
function revenueRowIsActual(row,indexes){
  const workStart=indexes.iWorkStart>=0?String(row[indexes.iWorkStart]||"").trim():"";
  const workEnd=indexes.iWorkEnd>=0?String(row[indexes.iWorkEnd]||"").trim():"";
  const value=indexes.iActual>=0?String(row[indexes.iActual]||"").normalize("NFKC").trim():"";
  if(value){
    const compact=value.replace(/\s/g,"");
    if(/^C$/i.test(compact)||/未実施|未提供|取消|中止|キャンセル/.test(compact))return false;
    if(/^(1|実施|実施済|提供済|済|○|〇)$/i.test(compact))return true;
  }
  return Boolean(workStart||workEnd);
}
function revenueIndexes(header){
  return {
    iDate:flexibleHeaderIndex(header,["サービス日付","サービス日","提供日","実施日"]),
    iClass:flexibleHeaderIndex(header,["サービス分類"]),
    iKind:flexibleHeaderIndex(header,["サービス種類","サービス種別"]),
    iItem:flexibleHeaderIndex(header,["サービス項目","サービスコード"]),
    iService:flexibleHeaderIndex(header,["サービス名","主なサービス名"]),
    iGroup:flexibleHeaderIndex(header,["グループ名","グループ"]),
    iUnits:flexibleHeaderIndex(header,["単位数/金額","単位数","金額"]),
    iPrivateBase:flexibleHeaderIndex(header,["本体価格（自費）","本体価格(自費)","自費本体価格"]),
    iActual:flexibleHeaderIndex(header,["実績有無","実績区分","実績状況","提供実績","サービス実績","実績"]),
    iWorkStart:flexibleHeaderIndex(header,["勤怠開始時刻","勤怠開始時間","実績開始時刻","実績開始時間"]),
    iWorkEnd:flexibleHeaderIndex(header,["勤怠終了時刻","勤怠終了時間","実績終了時刻","実績終了時間"]),
    iUser:flexibleHeaderIndex(header,["被保険者番号","受給者証番号","お客様番号１","利用者名","利用者"]),
    iUserName:flexibleHeaderIndex(header,["利用者名","利用者"]),
    iHelper:flexibleHeaderIndex(header,["スタッフ名","ヘルパー名","担当者名"]),
    iOffice:officeHeaderIndex(header)
  };
}
function revenueAddAmount(map,key,amount){map.set(key,(map.get(key)||0)+amount);}
function calculateRevenueRows(rows,fileName=""){
  if(!Array.isArray(rows)||rows.length<2)throw new Error("CSVの内容を読み取れませんでした");
  const header=rows[0].map(h=>String(h||"").replace(/^﻿/,"").trim()), indexes=revenueIndexes(header);
  if(indexes.iDate<0)throw new Error("「サービス日付」の列が見つかりません");
  if(indexes.iUnits<0&&indexes.iPrivateBase<0)throw new Error("「単位数/金額」または「本体価格（自費）」の列が見つかりません");
  const prepared=[]; let activeOffice="";
  for(let r=1;r<rows.length;r++){
    const row=rows[r]||[], directOffice=detectOfficeFromRow(row,indexes.iOffice);
    if(directOffice)activeOffice=directOffice;
    prepared.push({row,rowIndex:r,directOffice,rowOffice:directOffice||activeOffice});
  }
  let nextOffice="";
  for(let i=prepared.length-1;i>=0;i--){if(prepared[i].directOffice)nextOffice=prepared[i].directOffice;if(!prepared[i].rowOffice)prepared[i].rowOffice=nextOffice;}
  const fileOffice=detectOfficeName(fileName), claimUnits=new Map(), directAmounts=new Map(), present=new Map(), monthlySeen=new Set();
  let includedRows=0, skippedRows=0, duplicateRows=0, estimatedOfficeRows=0, missingPrivateBase=0, mobilityFromPrivateRows=0;
  for(const item of prepared){
    const {row,rowIndex}=item, date=normDate(row[indexes.iDate]);
    if(!date){if(String(row[indexes.iDate]||"").trim())skippedRows++;continue;}
    const classification=indexes.iClass>=0?String(row[indexes.iClass]||"").trim():"";
    const serviceKind=indexes.iKind>=0?String(row[indexes.iKind]||"").trim():"";
    const serviceItem=indexes.iItem>=0?String(row[indexes.iItem]||"").trim():"";
    const serviceName=indexes.iService>=0?String(row[indexes.iService]||"").trim():"";
    const groupName=indexes.iGroup>=0?String(row[indexes.iGroup]||"").trim():"";
    const category=revenueCategory(classification,serviceName,serviceKind,serviceItem,groupName);
    if(!category){skippedRows++;continue;}
    if(!revenueRowIsActual(row,indexes)){skippedRows++;continue;}
    const userName=indexes.iUserName>=0?String(row[indexes.iUserName]||"").trim():"";
    const helper=indexes.iHelper>=0?String(row[indexes.iHelper]||"").trim():"";
    const userValue=indexes.iUser>=0?String(row[indexes.iUser]||"").trim():"";
    let office=item.rowOffice||fileOffice;
    if(!office){
      const decision=typeof inferOffice==="function"?inferOffice(row,indexes.iOffice,userName,helper,fileName,{fileOffices:new Set(),pairOffices:new Map(),userOffices:new Map(),helperOffices:new Map(),rowOffice:new Map(),dominantOffice:""},rowIndex):null;
      office=decision?.office||((officeFilter==="用賀"||officeFilter==="二子玉川")?officeFilter:"用賀");
      estimatedOfficeRows++;
    }
    const month=revenueMonth(date.slice(0,7)), groupKey=office+"|"+month;
    if(!present.has(groupKey))present.set(groupKey,new Set());
    const units=revenueNumber(indexes.iUnits>=0?row[indexes.iUnits]:null);
    const privateBase=revenueNumber(indexes.iPrivateBase>=0?row[indexes.iPrivateBase]:null);
    if(category==="private"){
      const amount=units!==null&&units>=0?units:privateBase;
      if(amount===null||amount<0){missingPrivateBase++;skippedRows++;continue;}
      present.get(groupKey).add(category); revenueAddAmount(directAmounts,groupKey+"|"+category,Math.round(amount)); includedRows++; continue;
    }
    if(category==="mobility"){
      const classifiedAsPrivate=/自費|保険外/.test(classification.normalize("NFKC"));
      const amount=units!==null&&units>=0?units:privateBase;
      if(amount===null||amount<0){skippedRows++;continue;}
      if(classifiedAsPrivate)mobilityFromPrivateRows++;
      present.get(groupKey).add(category); revenueAddAmount(directAmounts,groupKey+"|"+category,Math.round(amount)); includedRows++; continue;
    }
    if(units===null||units<0){skippedRows++;continue;}
    present.get(groupKey).add(category);
    const userKey=userValue||userName||`row-${rowIndex}`;
    const isA2Monthly=/^A2$/i.test(serviceKind)&&!/日割/.test(serviceName+serviceItem);
    if(isA2Monthly){
      const duplicateKey=[office,month,userKey,serviceKind,serviceItem||serviceName].join("|");
      if(monthlySeen.has(duplicateKey)){duplicateRows++;continue;}
      monthlySeen.add(duplicateKey);
    }
    const rate=REVENUE_UNIT_RATES[category], treatmentRate=revenueTreatmentRate(category,`${classification} ${serviceKind} ${serviceItem} ${serviceName} ${groupName}`,month), specialRate=revenueSpecialAdditionRate(office,category);
    const claimKey=[office,month,category,serviceKind||classification,userKey,rate,treatmentRate,specialRate].join("|");
    revenueAddAmount(claimUnits,claimKey,units); includedRows++;
  }
  const calculated=new Map(directAmounts);
  for(const [key,units] of claimUnits){
    const [office,month,category,,,rate,treatmentRate,specialRate]=key.split("|");
    const specialUnits=Math.round(units*Number(specialRate||0)), subtotalUnits=units+specialUnits;
    const treatmentUnits=Math.round(subtotalUnits*Number(treatmentRate||0));
    revenueAddAmount(calculated,[office,month,category].join("|"),Math.floor((subtotalUnits+treatmentUnits)*Number(rate)));
  }
  const updates=[];
  for(const [groupKey,categories] of present){
    const [office,month]=groupKey.split("|"), amounts={};
    for(const category of categories)amounts[category]=Math.max(0,Math.round(calculated.get(groupKey+"|"+category)||0));
    updates.push({office,month,amounts,meta:{sourceRows:includedRows}});
  }
  if(!updates.length)throw new Error("売上として集計できる実績データがありませんでした");
  return {updates,includedRows,skippedRows,duplicateRows,estimatedOfficeRows,missingPrivateBase,mobilityFromPrivateRows};
}
async function decodeRevenueCsv(file){
  const buf=await file.arrayBuffer();
  let text=new TextDecoder("shift-jis").decode(buf);
  if(!text.includes("サービス日付")||(!text.includes("単位数")&&!text.includes("本体価格")))text=new TextDecoder("utf-8").decode(buf);
  return text;
}
function mergeRevenueUpdates(records,updates){
  const map=new Map(normalizeRevenueRecords(records).map(r=>[r.office+"|"+r.month,r]));
  for(const update of updates){
    const key=update.office+"|"+update.month, current=map.get(key)||{office:update.office,month:update.month,amounts:Object.fromEntries(REVENUE_CATEGORIES.map(c=>[c.key,null])),meta:{sourceRows:0}};
    for(const [category,amount] of Object.entries(update.amounts||{}))current.amounts[category]=amount;
    current.meta={sourceRows:(current.meta?.sourceRows||0)+(update.meta?.sourceRows||0)};
    map.set(key,current);
  }
  return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.office.localeCompare(b.office,"ja"));
}
async function importRevenueCsvFiles(fileList){
  const files=[...fileList]; if(!files.length)return;
  const updates=[], errors=[]; let included=0,duplicate=0,skipped=0,estimated=0,missingBase=0,mobilityFromPrivate=0;
  for(const file of files){
    try{
      const text=await decodeRevenueCsv(file), result=calculateRevenueRows(parseCSV(text),file.name);
      updates.push(...result.updates); included+=result.includedRows; duplicate+=result.duplicateRows; skipped+=result.skippedRows; estimated+=result.estimatedOfficeRows; missingBase+=result.missingPrivateBase; mobilityFromPrivate+=result.mobilityFromPrivateRows;
    }catch(error){errors.push(`${file.name}：${error.message||"読取エラー"}`);}
  }
  if(!updates.length){toast(errors[0]||"売上CSVを取り込めませんでした",5000);return;}
  state.revenue=mergeRevenueUpdates(state.revenue,updates); revenueDemo=false;
  const importedMonths=[...new Set(updates.map(r=>r.month))].sort(), first=importedMonths[0], last=importedMonths.at(-1);
  revenueTo=last; revenueFrom=importedMonths.length>1&&revenueMonths(first,last).length?first:shiftRevenueMonth(last,-1);
  const total=updates.reduce((sum,row)=>sum+Object.values(row.amounts).reduce((s,n)=>s+n,0),0);
  const notes=[`実績${included}行`,mobilityFromPrivate?`自費内の移動支援${mobilityFromPrivate}行を振り分け`:"",duplicate?`月額包括の重複${duplicate}行を除外`:"",skipped?`対象外${skipped}行`:"",estimated?`事業所推定${estimated}行`:"",missingBase?`自費金額なし${missingBase}行`:""].filter(Boolean).join("・");
  revenueImportStatus=`${files.length}ファイルを取り込み、${revenueMan(total)}万円を集計しました（${notes}）。`;
  await save(); renderRevenue();
  toast(`売上CSVを取り込みました（${revenueMan(total)}万円）${errors.length?`・${errors.length}件は読取不可`:""}`,5000);
}

function renderRevenue(){
  [".layout","#schedulePanel","#calendarPanel","#mapPanel"].forEach(s=>$(s).style.display="none");
  const panel=$("#revenuePanel"); panel.style.display="block";
  const records=normalizeRevenueRecords(revenueDemo?revenueSampleRecords():state.revenue);
  if(!revenueTo){
    revenueTo=records.map(r=>r.month).sort().at(-1)||revenueMonth(todayKey().slice(0,7));
    revenueFrom=shiftRevenueMonth(revenueTo,-1);
  }
  const months=summarizeRevenue(records,revenueMonths(revenueFrom,revenueTo),officeFilter);
  const total=months.reduce((sum,m)=>sum+(m.total||0),0), hasData=months.some(m=>m.total!==null);
  const latest=months.at(-1),diff=revenueDifference(latest,months.at(-2));
  const complete=months.filter(m=>m.complete).length;
  const scope=officeFilter==="all"?"全事業所（用賀・二子玉川）":officeFilter;
  panel.innerHTML=`<div class="rev-shell">
    <div class="rev-heading"><div><div class="rev-eyebrow">MONTHLY REVENUE</div><h2>売上比較</h2><p class="rev-muted">${scope} · CSVの実績から算出した月別売上概算</p></div>
      <form class="rev-range" id="revenueRange"><label>開始月<input type="month" name="from" value="${revenueFrom}" required></label><span>〜</span><label>終了月<input type="month" name="to" value="${revenueTo}" required></label><button class="btn" type="submit">表示</button></form></div>
    <div class="rev-range-error" id="revenueRangeError" role="status"></div>
    ${revenueDemo?'<div class="rev-demo-notice"><strong>表示例（架空の金額）</strong>　実際の売上データではありません。保存・集計には含まれません。</div>':""}
    ${revenueImportStatus&&!revenueDemo?`<div class="rev-import-notice" role="status">${esc(revenueImportStatus)}</div>`:""}
    <div class="rev-stats"><div class="rev-stat"><div class="rev-stat-label">表示期間の合計</div><div class="rev-stat-value">${hasData?revenueMan(total)+'<small>万円</small>':"—"}</div><div class="rev-stat-note">${complete===months.length?`${months.length}か月の売上合計`:hasData?"集計できた区分のみの合計":"売上CSVを取り込んでください"}</div></div>
      <div class="rev-stat"><div class="rev-stat-label">${latest?revenueMonthLabel(latest.month):"終了月"}の売上</div><div class="rev-stat-value">${latest?.total!=null?revenueMan(latest.total)+'<small>万円</small>':"—"}</div><div class="rev-stat-note">${latest?.total!=null&&!latest.complete?"一部未集計":scope}</div></div>
      <div class="rev-stat"><div class="rev-stat-label">前月との差（終了月）</div><div class="rev-stat-value ${diff?.amount>0?"rev-up":diff?.amount<0?"rev-down":""}">${diff?(diff.amount>0?"+":diff.amount<0?"−":"")+revenueMan(Math.abs(diff.amount))+'<small>万円</small>':"—"}</div><div class="rev-stat-note">${diff?.percent!=null?`前月比 ${diff.percent>0?"+":""}${diff.percent.toFixed(1)}%`:"両月・全区分が揃うと比較できます"}</div></div></div>
    <div class="rev-main"><section class="rev-card rev-chart-card" aria-labelledby="revenueChartTitle"><div class="rev-chart-head"><h3 id="revenueChartTitle">月別売上の推移（概算）</h3><span class="rev-muted">単位：万円</span></div><div class="rev-legend">${revenueLegend()}</div>${revenueChart(months)}<p class="rev-chart-foot">下から 介護 → 障害 → 総合事業 → 移動支援 → 自費。棒全体の高さが、その月の売上合計です。</p></section>
      <aside class="rev-card rev-source"><h3>売上CSVを取り込む</h3><p class="rev-muted">カナミックの「単位数/金額」を使い、月・事業所・サービス区分ごとに自動集計します。</p><input type="file" id="revenueFileInput" accept=".csv,text/csv" multiple hidden><button type="button" class="btn primary rev-import-button" id="revenueImport">売上CSV取込</button><p class="rev-file-hint">複数月・両事業所のCSVをまとめて選択できます。</p><div class="rev-rule"><strong>計算方法</strong><ul><li>介護：11.40円／単位＋処遇改善Ⅰロ 28.7％</li><li>総合事業：介護と分けて11.40円／単位＋Ⅰロ 28.7％</li><li>障害：11.20円／単位＋サービス別のⅠロ（用賀は特定事業所加算Ⅱを含む）</li><li>移動支援・自費：「単位数/金額」の金額</li></ul></div><p class="rev-muted rev-source-note">「実績」がCのキャンセル行は集計しません。Ⅰロは2026年6月以降の率です。障害は居宅介護45.6％、重度訪問38.2％、同行援護45.6％、行動援護42.1％で計算します。総合事業A2の月額包括コードは、利用者・月・コードごとに1回だけ計上します。表示額は管理・比較用の概算です。</p><button type="button" class="btn rev-sample-button" id="revenueSample">${revenueDemo?"表示例を閉じる":"表示例を見る"}</button></aside></div>
    <section class="rev-card rev-table-card" aria-labelledby="revenueTableTitle"><div class="rev-chart-head"><h3 id="revenueTableTitle">月別の内訳</h3><span class="rev-muted">単位：円</span></div>${revenueTable(months)}<p class="rev-table-note">「未集計」は0円とは区別しています。* は一部の事業所・区分が未集計の金額です。介護・総合事業・障害は利用者・月・制度別に単位を合算し、処遇改善加算の単位を四捨五入した後、金額の1円未満を切り捨てています。</p></section></div>`;
  $("#revenueRange").onsubmit=e=>{
    e.preventDefault();const form=e.currentTarget,from=form.elements.from.value,to=form.elements.to.value;
    if(!revenueMonths(from,to).length){$("#revenueRangeError").textContent="開始月・終了月を確認し、12か月以内の期間を選んでください。";return;}
    revenueFrom=from;revenueTo=to;renderRevenue();
  };
  $("#revenueImport").onclick=()=>$("#revenueFileInput").click();
  $("#revenueFileInput").onchange=e=>{const files=e.target.files;if(files?.length)importRevenueCsvFiles(files);e.target.value="";};
  $("#revenueSample").onclick=()=>{revenueDemo=!revenueDemo;revenueTo="";renderRevenue();};
}
function exportRevenueCsv(){
  if(revenueDemo){toast("表示例は架空の金額のため、出力しません");return;}
  const records=normalizeRevenueRecords(state.revenue).filter(r=>(officeFilter==="all"||r.office===officeFilter)&&r.month>=revenueFrom&&r.month<=revenueTo);
  if(!records.length){toast("出力する売上データがありません");return;}
  const rows=[["月","事業所",...REVENUE_CATEGORIES.map(c=>c.label+"（円・概算）")],...records.sort((a,b)=>a.month.localeCompare(b.month)||a.office.localeCompare(b.office,"ja")).map(r=>[r.month,r.office,...REVENUE_CATEGORIES.map(c=>r.amounts[c.key]??"")])];
  download("月別売上.csv","\uFEFF"+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n"));
  toast("月別売上CSVを書き出しました");
}
