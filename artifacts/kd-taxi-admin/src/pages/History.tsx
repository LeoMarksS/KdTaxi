import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

type Period={from:string;to:string;search:string};
type Day={day:string;total:number;finished:number;cancelled:number;revenue:number};
type HistoricalRide={id:string;clientName:string;driverName:string|null;origin:string;destination:string;status:string;vehicleType:string;price:number|null;payment:string|null;createdAt:string;finishedAt:string|null};
type Report=Period&{summary:{total:number;finished:number;cancelled:number;active:number;revenue:number};daily:Day[];rides:HistoricalRide[];page:number;pages:number};
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateLabel=(day:string)=>day.split('-').reverse().join('/');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const shift=(day:string,n:number)=>new Date(+new Date(`${day}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
const dateTime=(value:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Recife',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const states:Record<string,string>={waiting:'Aguardando',accepted:'Aceita',in_progress:'Em andamento',finished:'Concluída',cancelled:'Cancelada'};

async function loadHistory(period:Period,page:number):Promise<Report>{
 const params=new URLSearchParams({...period,page:String(page)});
 const res=await fetch(`${import.meta.env.VITE_API_URL||'https://api.kdtaxi.com.br/api'}/admin/history?${params}`,{headers:{Authorization:`Bearer ${localStorage.getItem('kd-taxi-admin-token')??''}`}});
 const data=await res.json().catch(()=>({}));
 if(!res.ok){const error=Object.assign(new Error(data.error||'Não foi possível consultar o histórico.'),{status:res.status});throw error;}
 return data;
}
export default function HistoryPage(){
 const [period,setPeriod]=useState<Period>(()=>({from:shift(today(),-6),to:today(),search:''}));
 const [draft,setDraft]=useState(period);const [page,setPage]=useState(1);const [formError,setFormError]=useState('');
 const query=useQuery({queryKey:['admin-history',period,page],queryFn:()=>loadHistory(period,page),refetchInterval:60000});
 const data=query.data;
 const select=(from:string,to:string)=>{const next={from,to,search:draft.search.trim()};setDraft(next);setPeriod(next);setPage(1);setFormError('');};
 const submit=(event:FormEvent)=>{event.preventDefault();if(!draft.from||!draft.to||draft.from>draft.to||(+new Date(draft.to)-+new Date(draft.from))/86400000>365){setFormError('Escolha um período de até 366 dias, com a data inicial antes da final.');return;}setPeriod({...draft,search:draft.search.trim()});setPage(1);setFormError('');};
 return <main className="page-enter"><div className="page-heading"><div><div className="eyebrow">CONSULTA DE DIAS ANTERIORES</div><h1>Histórico</h1><p>Consulte as corridas e os valores de qualquer dia registrado.</p></div><button className="button button-secondary" onClick={()=>void query.refetch()} disabled={query.isFetching}>{query.isFetching?'Consultando…':'Atualizar'}</button></div>
 <section className="content-panel settings-card history-filters"><div className="filter-pills"><button onClick={()=>select(today(),today())}>Hoje</button><button onClick={()=>select(shift(today(),-1),shift(today(),-1))}>Ontem</button><button onClick={()=>select(shift(today(),-6),today())}>Últimos 7 dias</button><button onClick={()=>select(today().slice(0,7)+'-01',today())}>Mês atual</button></div>
 <form onSubmit={submit} className="history-form"><label>Data inicial<input type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})} required /></label><label>Data final<input type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})} required /></label><label className="history-search">Passageiro, motorista ou trajeto<input value={draft.search} onChange={e=>setDraft({...draft,search:e.target.value})} maxLength={100} placeholder="Buscar no período" /></label><button className="button button-primary" type="submit">Consultar período</button></form>
 {formError&&<div className="form-alert" role="alert">{formError}</div>}<p className="history-note">Agrupado pela data da solicitação, no horário de Recife. Valores incluem apenas corridas concluídas e representam o total das corridas, antes dos acertos da plataforma. Os status são os atuais.</p></section>
 {query.isPending&&<p role="status">Carregando histórico…</p>}{query.isError&&<div className="form-alert" role="alert">{query.error instanceof Error?query.error.message:'Falha ao consultar.'} <button className="button button-secondary" onClick={()=>void query.refetch()}>Tentar novamente</button></div>}
 {data&&<><div className="panel-heading"><h2>{dateLabel(data.from)} a {dateLabel(data.to)}</h2>{data.search&&<span>Busca: {data.search}</span>}</div><section className="stats-grid history-stats">
 {[['Solicitadas',String(data.summary.total)],['Concluídas',String(data.summary.finished)],['Canceladas',String(data.summary.cancelled)],['Valor das concluídas',money(data.summary.revenue)]].map(([label,value])=><article className="stat-card" key={label}><div className="stat-top">{label}</div><div className="stat-value">{value}</div></article>)}
 </section><section className="content-panel list-panel"><div className="panel-heading"><h2>Resumo por dia</h2><span>Selecione uma data para consultar suas corridas.</span></div><div className="table-wrap history-daily"><table><thead><tr><th>Data</th><th>Solicitadas</th><th>Concluídas</th><th>Canceladas</th><th>Valor das concluídas</th><th>Consulta</th></tr></thead><tbody>{data.daily.map(d=><tr key={d.day}><td>{dateLabel(d.day)}</td><td>{d.total}</td><td>{d.finished}</td><td>{d.cancelled}</td><td>{money(d.revenue)}</td><td><button className="button button-plain" onClick={()=>select(d.day,d.day)}>Ver dia</button></td></tr>)}</tbody></table></div></section>
 <section className="content-panel list-panel"><div className="panel-heading"><h2>Corridas do período</h2><span>{data.summary.total} resultado(s) · {data.summary.active} aguardando ou em andamento</span></div><div className="table-wrap"><table><thead><tr><th>Solicitada</th><th>Passageiro</th><th>Motorista</th><th>Trajeto</th><th>Veículo</th><th>Status atual</th><th>Valor</th></tr></thead><tbody>{data.rides.map(r=><tr key={r.id}><td>{dateTime(r.createdAt)}</td><td>{r.clientName}</td><td>{r.driverName||'Não atribuído'}</td><td>{r.origin} → {r.destination}</td><td>{r.vehicleType==='motorcycle'?'Moto':'Carro'}</td><td><span className={`status-pill status-${r.status}`}>{states[r.status]||r.status}</span></td><td>{r.price===null?'Sem tarifa':money(r.price)}</td></tr>)}</tbody></table></div>{!data.rides.length&&<p className="settings-card">Nenhuma corrida encontrada nesse período ou nessa busca.</p>}
 <div className="table-footer history-pagination"><button className="button button-secondary" disabled={data.page<=1||query.isFetching} onClick={()=>setPage(data.page-1)}>Anterior</button><span>Página {data.page} de {data.pages} · até 25 corridas por página</span><button className="button button-secondary" disabled={data.page>=data.pages||query.isFetching} onClick={()=>setPage(data.page+1)}>Próxima</button></div></section></>}
 </main>;
}
