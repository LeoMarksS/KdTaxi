import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Driver = { id: string; name: string; deleted: boolean; rides: number; base: number; fees: number; received: number; balance: number };
type Settlement = { id: string; driverName: string; amount: number; note: string; createdAt: string; voidedAt: string | null; voidReason: string | null };
type Finance = { settings: { enabled: boolean; rateBps: number }; drivers: Driver[]; settlements: Settlement[] };
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cents = (value: string) => {
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('Informe um valor com até duas casas decimais.');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};
async function request<T>(path: string, body?: object, method = 'POST'): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://api.kdtaxi.com.br/api'}/admin/finance${path}`, {
    method: body ? method : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('kd-taxi-admin-token') ?? ''}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || (!body && res.status === 403)) window.dispatchEvent(new Event('kd-taxi-auth-expired'));
  if (!res.ok) throw new Error(data.error || 'Não foi possível carregar o financeiro.');
  return data;
}

export default function FinancePage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [data, setData] = useState<Finance | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState('8,33');
  const [base, setBase] = useState('6,00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [driver, setDriver] = useState<Driver | null>(null);
  const [voiding, setVoiding] = useState<Settlement | null>(null);
  const [receiptId, setReceiptId] = useState('');
  const initialized = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const next = await request<Finance>(''); setData(next);
      if (!initialized.current) { setEnabled(next.settings.enabled); setRate((next.settings.rateBps / 100).toFixed(2).replace('.', ',')); initialized.current = true; }
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar.'); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => clearInterval(timer); }, [refresh]);
  let preview = 'Informe valores válidos para simular.';
  try {
    const b = cents(base), bps = cents(rate);
    if (bps <= 10000) { const fee = Math.floor((b * bps + 5000) / 10000); preview = `Motorista: ${money(b/100)} · KD TAXI: ${money(fee/100)} · Passageiro: ${money((b+fee)/100)}`; }
  } catch { /* Inline help above remains visible. */ }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await request('/settings', { enabled, rateBps: cents(rate), currentPassword: fields.get('currentPassword') }, 'PUT'); form.reset(); await refresh(); notify(enabled ? 'Taxa ativada somente para novas solicitações.' : 'Cobrança desativada para novas solicitações.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  };
  const receipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      if (voiding) await request(`/settlements/${voiding.id}/void`, { reason: fields.get('reason'), currentPassword: fields.get('currentPassword') });
      else if (driver) await request('/settlements', { id: receiptId, driverId: driver.id, amountCents: cents(String(fields.get('amount'))), note: fields.get('note'), currentPassword: fields.get('currentPassword') });
      await refresh(); setDriver(null); setVoiding(null); notify(voiding ? 'Registro anulado. O saldo foi recomposto.' : 'Recebimento registrado.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao registrar.'); }
    finally { setBusy(false); }
  };
  return <main className="page-enter"><div className="page-heading"><div><div className="eyebrow">TAXA DA PLATAFORMA E ACERTOS</div><h1>Financeiro</h1><p>O passageiro paga ao motorista. Aqui você controla a parte devida ao KD TAXI.</p></div><button className="button button-secondary" onClick={() => void refresh()}>Atualizar</button></div>
    {!data && !error && <p role="status">Carregando financeiro…</p>}
    {error && !driver && !voiding && <div className="form-alert" role="alert">{error}</div>}
    {data && <>
      <div className="summary-band finance-summary"><div><span>Taxa em vigor</span><b>{data.settings.enabled ? `${(data.settings.rateBps/100).toLocaleString('pt-BR')}%` : '0% · lançamento'}</b></div><div><span>Gerado em corridas concluídas</span><b>{money(data.drivers.reduce((s,d) => s+d.fees,0))}</b></div><div><span>Acertos recebidos</span><b>{money(data.drivers.reduce((s,d) => s+d.received,0))}</b></div><div><span>A receber</span><b>{money(data.drivers.reduce((s,d) => s+d.balance,0))}</b></div></div>
      <section className="content-panel settings-card"><h2>Configurar taxa</h2><p>A taxa é acrescentada à tarifa base. O motorista mantém o valor base e recolhe a parte da plataforma. Corridas anteriores mantêm os valores da solicitação; canceladas não geram cobrança.</p>
        <form className="form-stack" onSubmit={save}>
          <label className="reset-checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Ativar taxa para novas solicitações</label>
          <label>Porcentagem sobre a tarifa base<input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" required /></label>
          <label>Tarifa base para simulação<input value={base} onChange={e => setBase(e.target.value)} inputMode="decimal" /></label>
          <div className="warning-card"><span><strong>Simulação do percentual informado</strong><br />{preview}<br />{enabled ? 'Ao salvar, será aplicado às próximas solicitações.' : 'Com a cobrança desativada, a taxa efetiva continua em R$ 0,00.'}</span></div>
          <label>Sua senha para confirmar a configuração<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configuração'}</button>
        </form>
      </section>
      <section className="content-panel list-panel"><div className="panel-heading"><div><h2>Saldo por motorista</h2><p>Contabiliza somente corridas concluídas registradas após esta atualização.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Motorista</th><th>Concluídas</th><th>Valor base</th><th>Taxa KD TAXI</th><th>Recebido</th><th>A receber</th><th>Acerto</th></tr></thead><tbody>{data.drivers.map(d => <tr key={d.id}><td>{d.name}{d.deleted && <small> · Conta excluída</small>}</td><td>{d.rides}</td><td>{money(d.base)}</td><td>{money(d.fees)}</td><td>{money(d.received)}</td><td><strong>{money(d.balance)}</strong></td><td><button className="button button-secondary" disabled={d.balance<=0 || busy} onClick={() => { setError(''); setDriver(d); setReceiptId(crypto.randomUUID()); }}>Registrar recebimento</button></td></tr>)}</tbody></table></div>{!data.drivers.length && <p className="settings-card">Nenhum motorista cadastrado.</p>}
      </section>
      <section className="content-panel settings-card"><h2>Últimos 100 acertos</h2><p>São registros manuais de valores que você já recebeu. O painel não movimenta dinheiro.</p><div className="table-wrap"><table><thead><tr><th>Data</th><th>Motorista</th><th>Valor</th><th>Observação</th><th>Situação</th></tr></thead><tbody>{data.settlements.map(s => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('pt-BR')}</td><td>{s.driverName}</td><td>{money(s.amount)}</td><td>{s.note || '—'}</td><td>{s.voidedAt ? `Anulado: ${s.voidReason}` : <button className="button button-plain" onClick={() => { setError(''); setVoiding(s); }}>Corrigir registro</button>}</td></tr>)}</tbody></table></div>{!data.settlements.length && <p>Nenhum recebimento registrado.</p>}</section>
    </>}
    {(driver || voiding) && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="finance-dialog-title"><h2 id="finance-dialog-title">{voiding ? 'Anular registro de recebimento' : `Recebimento de ${driver?.name}`}</h2><p>{voiding ? 'O registro permanecerá no histórico como anulado e o valor voltará ao saldo devido. Nenhum dinheiro será transferido.' : `Confirme apenas um valor que você já recebeu. Saldo disponível: ${money(driver?.balance ?? 0)}.`}</p><form className="form-stack" onSubmit={receipt}>
      {voiding ? <label>Motivo da correção<textarea name="reason" maxLength={300} required /></label> : <><label>Valor recebido<input name="amount" inputMode="decimal" defaultValue={driver?.balance.toFixed(2).replace('.', ',')} required /></label><label>Observação<input name="note" maxLength={300} placeholder="Ex.: Pix recebido em 07/11" /></label><label className="reset-checkbox"><input type="checkbox" required /> Confirmo que recebi este valor do motorista.</label></>}
      <label>Sua senha atual<input name="currentPassword" type="password" autoComplete="current-password" required /></label>{error && <div className="form-alert" role="alert">{error}</div>}<div className="dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => { setDriver(null); setVoiding(null); setError(''); }}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar registro'}</button></div></form></section></div>}
  </main>;
}
