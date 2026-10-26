import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import {
  getGetAdminStatsQueryKey, getListUsersQueryKey, getListRidesQueryKey, getListPricingQueryKey,
  useGetAdminStats, useListUsers, useListRides, useListPricing, useLoginUser, useLogoutUser,
  useCreateAdminUser, useUpdateAdminUser, useDeleteAdminUser, useUpsertPricing, useDeletePricing,
} from '@workspace/api-client-react';
import type { AdminStats, User, Ride, PriceRule, AdminUserInput, PricingInput } from '@workspace/api-client-react';
import {
  Activity, ArrowRight, ArrowUpRight, Bike, CarFront, Check, CircleHelp,
  CreditCard, DollarSign, LayoutDashboard, LogOut, MapPin, Menu,
  Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Star, Tag, Trash2, UserRound,
  UsersRound, X, Zap,
} from 'lucide-react';
import logo from './assets/kd-taxi-icon.png';
import NotFound from '@/pages/not-found';

const TOKEN_KEY = 'kd-taxi-admin-token';
const USER_KEY = 'kd-taxi-admin-user';
setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

type PageName = 'overview' | 'users' | 'rides' | 'pricing';
type ToastState = { message: string; kind?: 'error' | 'success' } | null;

const isAuthError = (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error && ((error as { status: number }).status === 401 || (error as { status: number }).status === 403));
const raiseAuthExpired = () => window.dispatchEvent(new Event('kd-taxi-auth-expired'));
const AUTO_REFRESH_MS = 60_000;
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error) => { if (isAuthError(error)) raiseAuthExpired(); } }),
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, refetchIntervalInBackground: false } },
});

const formatMoney = (value?: number | null) => value == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
const roleName = (mode: User['mode']) => mode === 'driver' ? 'Motorista' : mode === 'admin' ? 'Administrador' : 'Cliente';
const rideStatusName: Record<Ride['status'], string> = { waiting: 'Aguardando', accepted: 'Aceita', in_progress: 'Em andamento', finished: 'Concluída', cancelled: 'Cancelada' };

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 4300);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast ${toast.kind === 'error' ? 'toast-error' : ''}`} role="status" data-testid="status-toast">
    {toast.kind === 'error' ? <CircleHelp size={17} /> : <Check size={17} />}
    <span>{toast.message}</span><button onClick={onClose} aria-label="Fechar aviso" data-testid="button-close-toast"><X size={15} /></button>
  </div>;
}

function IconButton({ children, label, onClick, testId }: { children: ReactNode; label: string; onClick: () => void; testId: string }) {
  return <button className="icon-button" aria-label={label} title={label} onClick={onClick} data-testid={testId}>{children}</button>;
}

function Button({ children, onClick, variant = 'primary', type = 'button', disabled, testId }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'plain'; type?: 'button' | 'submit'; disabled?: boolean; testId: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant}`} data-testid={testId}>{children}</button>;
}

function Dialog({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-heading"><div><div className="eyebrow">KD TAXI · ADMINISTRAÇÃO</div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <IconButton label="Fechar" onClick={onClose} testId="button-close-dialog"><X size={18} /></IconButton></div>
      {children}
    </section>
  </div>;
}

function LoadingRows({ count = 5 }: { count?: number }) {
  return <div className="skeleton-stack" aria-label="Carregando"><div className="skeleton skeleton-head" />{Array.from({ length: count }, (_, index) => <div className="skeleton skeleton-row" key={index} />)}</div>;
}

function QueryError({ onRetry, message = 'Não foi possível carregar estes dados.' }: { onRetry: () => void; message?: string }) {
  return <div className="state-card"><div className="state-icon error-icon"><RefreshCw size={20} /></div><strong>Algo não carregou</strong><p>{message} Verifique sua conexão e tente novamente.</p><Button variant="secondary" onClick={onRetry} testId="button-retry"><RefreshCw size={15} /> Tentar novamente</Button></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="state-card"><div className="state-icon"><Search size={20} /></div><strong>{title}</strong><p>{text}</p>{action}</div>;
}

function StatusPill({ status }: { status: Ride['status'] }) {
  return <span className={`status-pill status-${status}`} data-testid={`status-ride-${status}`}>{rideStatusName[status]}</span>;
}

function StatCard({ label, value, note, icon, trend, accent = false }: { label: string; value: string; note: string; icon: ReactNode; trend?: ReactNode; accent?: boolean }) {
  return <article className={`stat-card ${accent ? 'stat-highlight' : ''}`} data-testid={`card-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div>
    <div className="stat-value">{value}</div><div className="stat-bottom"><span>{note}</span>{trend}</div>
  </article>;
}

function Dashboard({ goRides }: { goRides: () => void }) {
  const statsQuery = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey(), refetchInterval: AUTO_REFRESH_MS } });
  const ridesQuery = useListRides({ query: { queryKey: getListRidesQueryKey(), refetchInterval: AUTO_REFRESH_MS } });
  const stats = statsQuery.data as AdminStats | undefined;
  const recentRides = useMemo(() => [...(ridesQuery.data ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6), [ridesQuery.data]);
  const refresh = () => { void statsQuery.refetch(); void ridesQuery.refetch(); };
  return <main className="page-enter">
    <div className="page-heading"><div><div className="eyebrow">CENTRAL DE OPERAÇÕES <span className="live-indicator">● AO VIVO</span></div><h1>Visão geral</h1><p>O pulso da operação, em um só lugar.</p></div>
      <div className="heading-actions"><span className="updated-note"><span className="live-dot" /> Atualização automática · 1 min</span><Button variant="secondary" onClick={refresh} testId="button-refresh-overview"><RefreshCw size={15} /> Atualizar</Button></div></div>
    {statsQuery.isLoading ? <div className="stats-grid">{Array.from({ length: 6 }, (_, index) => <div className="stat-card stat-skeleton" key={index}><div className="skeleton sk-line" /><div className="skeleton sk-big" /><div className="skeleton sk-line short" /></div>)}</div> :
      statsQuery.isError && !stats ? <QueryError onRetry={() => void statsQuery.refetch()} /> : stats && <>
        <section className="stats-grid">
          <StatCard label="Corridas hoje" value={stats.todayRides.toLocaleString('pt-BR')} note={`${stats.activeRides} em andamento agora`} icon={<Activity size={17} />} trend={<ArrowUpRight size={16} className="trend-icon" />} accent />
          <StatCard label="Faturamento hoje" value={formatMoney(stats.todayRevenue)} note={`${stats.finishedRides.toLocaleString('pt-BR')} concluídas no total`} icon={<DollarSign size={17} />} />
          <StatCard label="Motoristas online" value={stats.onlineDrivers.toLocaleString('pt-BR')} note={`${stats.onlineCarDrivers} carros · ${stats.onlineMotorcycleDrivers} motos`} icon={<Zap size={17} />} />
          <StatCard label="Usuários" value={stats.totalUsers.toLocaleString('pt-BR')} note={`${stats.totalClients} clientes · ${stats.totalDrivers} motoristas`} icon={<UsersRound size={17} />} />
          <StatCard label="Corridas totais" value={stats.totalRides.toLocaleString('pt-BR')} note={`${stats.cancelledRides} canceladas`} icon={<MapPin size={17} />} />
          <StatCard label="Avaliação média" value={stats.avgRating.toFixed(1)} note="Média da experiência" icon={<Star size={17} />} />
        </section>
        <section className="ops-strip">
          <div className="ops-copy"><div className="eyebrow">SINAL DA OPERAÇÃO</div><strong>{stats.activeRides > 0 ? `${stats.activeRides} corrida${stats.activeRides === 1 ? '' : 's'} em movimento` : 'Operação sem corridas ativas'}</strong><span>Motoristas disponíveis neste momento</span></div>
          <div className="fleet-metric"><span className="fleet-glyph"><CarFront size={19} /></span><div><b>{stats.onlineCarDrivers}</b><small>Carros</small></div></div>
          <div className="fleet-metric"><span className="fleet-glyph bike-glyph"><Bike size={19} /></span><div><b>{stats.onlineMotorcycleDrivers}</b><small>Motocicletas</small></div></div>
          <div className="occupancy"><div className="occupancy-label"><span>Disponibilidade</span><b>{stats.onlineDrivers} online</b></div><div className="meter"><i style={{ width: `${stats.totalDrivers ? Math.min(100, stats.onlineDrivers / stats.totalDrivers * 100) : 0}%` }} /></div><small>de {stats.totalDrivers} motoristas cadastrados</small></div>
        </section>
        <section className="content-panel recent-panel">
          <div className="panel-heading"><div><div className="eyebrow">MOVIMENTO RECENTE</div><h2>Últimas corridas</h2></div><Button variant="plain" onClick={goRides} testId="button-view-all-rides">Ver todas <ArrowRight size={15} /></Button></div>
          {ridesQuery.isLoading && !ridesQuery.data ? <LoadingRows count={4} /> : ridesQuery.isError && !ridesQuery.data ? <QueryError onRetry={() => void ridesQuery.refetch()} /> : recentRides.length === 0 ?
            <EmptyState title="Nenhuma corrida por aqui" text="As corridas recentes aparecerão aqui quando houver atividade." /> :
            <div className="table-wrap"><table><thead><tr><th>Corrida</th><th>Trajeto</th><th>Motorista</th><th>Status</th><th>Valor</th><th>Solicitada</th></tr></thead><tbody>
              {recentRides.map((ride) => <RideRow key={ride.id} ride={ride} compact />)}
            </tbody></table></div>}
        </section>
      </>}
    <div className="dashboard-foot"><span><ShieldCheck size={14} /> Dados operacionais fornecidos pela plataforma</span><span className="mono">KD / OPS</span></div>
  </main>;
}

function RideRow({ ride, compact = false }: { ride: Ride; compact?: boolean }) {
  return <tr data-testid={`row-ride-${ride.id}`}>
    <td><div className="person-cell"><span className="avatar avatar-small">{initials(ride.clientName || 'KD')}</span><div><strong>{ride.clientName}</strong><small className="mono">{ride.clientPhone}</small></div></div></td>
    <td><div className="route-cell"><span>{ride.origin}</span><ArrowRight size={12} /><span>{ride.destination}</span></div></td>
    <td>{ride.driverName ? <div className="person-cell"><span className="driver-mark"><CarFront size={14} /></span><span>{ride.driverName}</span></div> : <span className="muted-text">Não atribuído</span>}</td>
    <td><StatusPill status={ride.status} /></td>
    <td><div className="money-cell">{formatMoney(ride.price)}<small>{ride.payment === 'pix' ? 'Pix' : ride.payment === 'dinheiro' ? 'Dinheiro' : 'Pagamento pendente'}</small></div></td>
    <td><span className="date-cell">{formatDate(ride.createdAt)}</span></td>
  </tr>;
}

function UserPage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const queryClient = useQueryClient();
  const query = useListUsers({ query: { queryKey: getListUsersQueryKey(), refetchInterval: AUTO_REFRESH_MS } });
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'client' | 'driver'>('all');
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<'client' | 'driver'>('client');
  const [removing, setRemoving] = useState<User | null>(null);
  const [formError, setFormError] = useState('');
  const users = query.data ?? [];
  const filtered = useMemo(() => users.filter((user) => (filter === 'all' || user.mode === filter) && `${user.name} ${user.phone}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [users, filter, search]);
  const countByMode = (mode: string) => users.filter((user) => user.mode === mode).length;
  const saveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!name || !phone || (!editing && password.length < 4) || (editing && password && password.length < 4)) { setFormError('Informe nome, telefone e uma senha com pelo menos 4 caracteres.'); return; }
    if (editing) {
      const vehicleType = String(form.get('vehicleType') ?? editing.vehicleType ?? 'car') as NonNullable<User['vehicleType']>;
      const data = { name, phone, ...(editing.mode === 'driver' ? { vehicleType } : {}), ...(password ? { password } : {}) };
      updateUser.mutate({ id: editing.id, data }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); setEditing(null); notify('Perfil atualizado.'); }, onError: (error) => { if (isAuthError(error)) raiseAuthExpired(); setFormError(isAuthError(error) ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível salvar as alterações.'); } });
    } else {
      const data: AdminUserInput = {
        name, phone, password, mode: createMode,
        ...(createMode === 'driver' ? { vehicleType: String(form.get('vehicleType') ?? 'car') as NonNullable<User['vehicleType']> } : {}),
      };
      createUser.mutate({ data }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }); setCreating(false); notify('Conta criada com sucesso.'); }, onError: (error) => { if (isAuthError(error)) raiseAuthExpired(); setFormError(isAuthError(error) ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível criar a conta. Confira os dados e tente novamente.'); } });
    }
  };
  const confirmDelete = () => {
    if (!removing) return;
    deleteUser.mutate({ id: removing.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }); notify('Conta excluída.'); setRemoving(null); }, onError: (error) => { if (isAuthError(error)) { raiseAuthExpired(); return; } notify('Não foi possível excluir esta conta.', 'error'); } });
  };
  const modalUser = editing ?? undefined;
  return <main className="page-enter">
     <div className="page-heading"><div><div className="eyebrow">CADASTROS · {users.length.toLocaleString('pt-BR')} CONTAS</div><h1>Usuários</h1><p>Gerencie os perfis que fazem a operação acontecer.</p></div><Button onClick={() => { setFormError(''); setCreateMode('client'); setCreating(true); }} testId="button-add-user"><Plus size={16} /> Novo usuário</Button></div>
     <div className="summary-band"><div><span>Clientes</span><b>{countByMode('client')}</b></div><i /><div><span>Motoristas</span><b>{countByMode('driver')}</b></div><i /><div className="band-note"><span>Disponibilidade é gerida no app do motorista.</span></div></div>
    <section className="content-panel list-panel">
      <div className="filters-row"><div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar usuários" data-testid="input-search-users" />{search && <button onClick={() => setSearch('')} aria-label="Limpar busca" data-testid="button-clear-user-search"><X size={14} /></button>}</div>
        <div className="filter-pills" role="group" aria-label="Filtrar usuários">{(['all', 'client', 'driver'] as const).map((option) => <button key={option} className={filter === option ? 'filter-active' : ''} onClick={() => setFilter(option)} data-testid={`filter-users-${option}`}>{option === 'all' ? `Todos ${users.length}` : `${roleName(option)} ${countByMode(option)}`}</button>)}</div></div>
       {query.isLoading && !query.data ? <LoadingRows /> : query.isError && !query.data ? <QueryError onRetry={() => void query.refetch()} /> : filtered.length === 0 ?
        <EmptyState title={search ? 'Nenhum resultado' : 'Nenhum usuário cadastrado'} text={search ? 'Tente buscar por outro nome ou telefone.' : 'Cadastros aparecerão aqui quando forem criados.'} /> :
        <div className="table-wrap"><table><thead><tr><th>Perfil</th><th>Tipo</th><th>Corridas</th><th>Avaliação</th><th>Cadastro</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
          {filtered.map((user) => <tr key={user.id} data-testid={`row-user-${user.id}`}>
            <td><div className="person-cell"><span className="avatar">{user.photo ? <img src={user.photo} alt="" /> : initials(user.name)}</span><div><strong data-testid={`text-user-name-${user.id}`}>{user.name}</strong><small className="mono">{user.phone}</small></div></div></td>
            <td><span className={`role-pill role-${user.mode}`}>{user.mode === 'driver' ? user.vehicleType === 'motorcycle' ? <Bike size={13} /> : <CarFront size={13} /> : <UserRound size={13} />}{roleName(user.mode)}</span></td>
            <td className="mono numeric">{user.rideCount.toLocaleString('pt-BR')}</td><td><span className="rating-cell"><Star size={13} />{user.rating.toFixed(1)}</span></td>
            <td className="date-cell">{formatDate(user.createdAt)}</td>
            <td><div className="row-actions"><IconButton label={`Editar ${user.name}`} onClick={() => { setFormError(''); setEditing(user); }} testId={`button-edit-user-${user.id}`}><Settings2 size={16} /></IconButton>
              <IconButton label={`Excluir ${user.name}`} onClick={() => setRemoving(user)} testId={`button-delete-user-${user.id}`}><Trash2 size={16} /></IconButton></div></td>
          </tr>)}
        </tbody></table></div>}
       <div className="table-footer"><span>Exibindo <b>{filtered.length}</b> de <b>{users.length}</b> usuários</span><span className="mono">ATUALIZAÇÃO AUTOMÁTICA · 1 MIN</span></div>
    </section>
    {(creating || modalUser) && <Dialog title={editing ? 'Editar perfil' : 'Novo usuário'} subtitle={editing ? 'Atualize os dados básicos deste cadastro.' : 'Cadastre um cliente ou motorista na plataforma.'} onClose={() => { setCreating(false); setEditing(null); }} >
      <form onSubmit={saveUser} className="form-stack">
        <label>Nome completo<input name="name" defaultValue={modalUser?.name ?? ''} required autoFocus placeholder="Nome do usuário" data-testid="input-user-name" /></label>
        <label>Telefone<input name="phone" defaultValue={modalUser?.phone ?? ''} required type="tel" placeholder="(00) 00000-0000" data-testid="input-user-phone" /></label>
         {!editing && <label>Tipo de conta<select name="mode" value={createMode} onChange={(event) => setCreateMode(event.target.value as 'client' | 'driver')} data-testid="select-user-mode"><option value="client">Cliente</option><option value="driver">Motorista</option></select></label>}
         {(!editing && createMode === 'driver') || editing?.mode === 'driver' ? <label>Veículo<select name="vehicleType" defaultValue={modalUser?.vehicleType ?? 'car'} data-testid="select-user-vehicle"><option value="car">KD CARRO</option><option value="motorcycle">KD MOTO</option></select></label> : null}
        <label>{editing ? 'Nova senha (opcional)' : 'Senha'}<input name="password" type="password" minLength={4} required={!editing} placeholder={editing ? 'Deixe em branco para manter' : 'Mínimo de 4 caracteres'} data-testid="input-user-password" /></label>
         {(editing?.mode === 'driver' || (!editing && createMode === 'driver')) && <p className="form-note"><ShieldCheck size={14} /> A disponibilidade do motorista é controlada no aplicativo.</p>}
        {formError && <div className="form-alert" role="alert">{formError}</div>}
        <div className="dialog-actions"><Button variant="secondary" onClick={() => { setCreating(false); setEditing(null); }} testId="button-cancel-user">Cancelar</Button><Button type="submit" disabled={createUser.isPending || updateUser.isPending} testId="button-save-user">{createUser.isPending || updateUser.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar usuário'}</Button></div>
      </form>
    </Dialog>}
    {removing && <Dialog title="Excluir usuário?" subtitle={`Esta ação remove a conta de ${removing.name}. Não será possível desfazer.`} onClose={() => setRemoving(null)}>
      <div className="warning-card"><Trash2 size={17} /><span>A conta será removida da lista de usuários da plataforma.</span></div><div className="dialog-actions"><Button variant="secondary" onClick={() => setRemoving(null)} testId="button-cancel-delete-user">Cancelar</Button><Button variant="danger" onClick={confirmDelete} disabled={deleteUser.isPending} testId="button-confirm-delete-user">{deleteUser.isPending ? 'Excluindo…' : 'Excluir conta'}</Button></div>
    </Dialog>}
  </main>;
}

function RidesPage() {
  const query = useListRides({ query: { queryKey: getListRidesQueryKey(), refetchInterval: AUTO_REFRESH_MS } });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const rides = query.data ?? [];
  const filtered = useMemo(() => rides.filter((ride) => (filter === 'all' || ride.status === filter) && `${ride.clientName} ${ride.clientPhone} ${ride.driverName ?? ''} ${ride.origin} ${ride.destination}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [rides, search, filter]);
  const options = ['all', 'waiting', 'accepted', 'in_progress', 'finished', 'cancelled'];
  const count = (status: string) => status === 'all' ? rides.length : rides.filter((ride) => ride.status === status).length;
  return <main className="page-enter">
     <div className="page-heading"><div><div className="eyebrow">ACOMPANHAMENTO · {rides.length.toLocaleString('pt-BR')} REGISTROS</div><h1>Corridas</h1><p>Visibilidade completa do início ao destino.</p></div><span className="updated-note"><span className="live-dot" /> Atualização automática · 1 min</span></div>
    <section className="content-panel list-panel">
      <div className="filters-row rides-filter-row"><div className="search-field ride-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar passageiro, motorista ou trajeto" aria-label="Buscar corridas" data-testid="input-search-rides" />{search && <button onClick={() => setSearch('')} aria-label="Limpar busca" data-testid="button-clear-ride-search"><X size={14} /></button>}</div>
        <span className="filter-count"><SlidersHorizontal size={14} /> {filtered.length} resultados</span></div>
      <div className="filter-pills status-filters">{options.map((status) => <button key={status} className={filter === status ? 'filter-active' : ''} onClick={() => setFilter(status)} data-testid={`filter-rides-${status}`}>{status === 'all' ? 'Todas' : rideStatusName[status as Ride['status']]} <span>{count(status)}</span></button>)}</div>
       {query.isLoading && !query.data ? <LoadingRows count={7} /> : query.isError && !query.data ? <QueryError onRetry={() => void query.refetch()} /> : filtered.length === 0 ?
        <EmptyState title={search ? 'Nenhuma corrida encontrada' : 'Sem corridas para exibir'} text={search ? 'Revise o termo ou selecione outro status.' : 'Quando uma corrida for solicitada, ela será listada aqui.'} /> :
        <div className="table-wrap"><table className="rides-table"><thead><tr><th>Passageiro</th><th>Origem → destino</th><th>Motorista</th><th>Veículo</th><th>Status</th><th>Pagamento</th><th>Valor</th><th>Solicitada</th></tr></thead><tbody>
          {filtered.map((ride) => <tr key={ride.id} data-testid={`row-ride-${ride.id}`}>
            <td><div className="person-cell"><span className="avatar avatar-small">{initials(ride.clientName || 'KD')}</span><div><strong>{ride.clientName}</strong><small className="mono">{ride.clientPhone}</small></div></div></td>
            <td><div className="route-stack"><span><i className="route-point origin-point" />{ride.origin}</span><span><i className="route-point destination-point" />{ride.destination}</span></div></td>
            <td>{ride.driverName ? <span className="driver-name">{ride.driverName}</span> : <span className="muted-text">Aguardando</span>}</td>
            <td><span className="vehicle-label">{ride.vehicleType === 'car' ? <CarFront size={15} /> : <Bike size={15} />}{ride.vehicleType === 'car' ? 'Carro' : 'Moto'}</span></td>
            <td><StatusPill status={ride.status} /></td><td><span className={`payment-tag ${ride.payment ? '' : 'pending-payment'}`}><CreditCard size={13} />{ride.payment === 'pix' ? 'Pix' : ride.payment === 'dinheiro' ? 'Dinheiro' : '—'}</span></td>
            <td className="mono price-value">{formatMoney(ride.price)}</td><td><div className="ride-dates"><span>{formatDate(ride.createdAt)}</span>{ride.acceptedAt && <small>Aceita · {formatDate(ride.acceptedAt)}</small>}{ride.finishedAt && <small>Finalizada · {formatDate(ride.finishedAt)}</small>}</div></td>
          </tr>)}
        </tbody></table></div>}
       <div className="table-footer"><span>Exibindo <b>{filtered.length}</b> de <b>{rides.length}</b> corridas</span><span className="mono">ATUALIZAÇÃO AUTOMÁTICA · 1 MIN</span></div>
    </section>
  </main>;
}

function PricingPage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const queryClient = useQueryClient();
  const query = useListPricing({ query: { queryKey: getListPricingQueryKey(), refetchInterval: AUTO_REFRESH_MS } });
  const upsert = useUpsertPricing();
  const deleteRule = useDeletePricing();
  const [editing, setEditing] = useState<PriceRule | null>(null);
  const [removing, setRemoving] = useState<PriceRule | null>(null);
  const [formError, setFormError] = useState('');
  const [localPriceError, setLocalPriceError] = useState('');
  const rules = useMemo(() => [...(query.data ?? [])].sort((a, b) => Number(Boolean(b.isLocal)) - Number(Boolean(a.isLocal)) || a.destination.localeCompare(b.destination)), [query.data]);
  const localRule = rules.find((rule) => rule.isLocal);
  const destinationRules = rules.filter((rule) => !rule.isLocal);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    const form = new FormData(event.currentTarget);
    const destination = String(form.get('destination') ?? '').trim();
    const price = Number(form.get('price'));
    if (!destination || !Number.isFinite(price) || price < 0) { setFormError('Informe um destino e um preço válido.'); return; }
    const data: PricingInput = { destination, price, isLocal: false };
    upsert.mutate({ data }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListPricingQueryKey() }); setEditing(null); notify(editing?.id ? 'Regra de preço atualizada.' : 'Regra de preço criada.'); }, onError: (error) => { if (isAuthError(error)) raiseAuthExpired(); setFormError(isAuthError(error) ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível salvar a regra. Confira os dados e tente novamente.'); } });
  };
  const saveLocalPrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalPriceError('');
    const price = Number(new FormData(event.currentTarget).get('localPrice'));
    if (!Number.isFinite(price) || price < 0) { setLocalPriceError('Informe um preço local válido.'); return; }
    const data: PricingInput = { destination: 'Corridas locais', price, isLocal: true };
    upsert.mutate({ data }, {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListPricingQueryKey() }); notify('Preço fixo local salvo.'); },
      onError: (error) => { if (isAuthError(error)) raiseAuthExpired(); setLocalPriceError(isAuthError(error) ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível salvar o preço local. Tente novamente.'); },
    });
  };
  const confirmDelete = () => {
    if (!removing) return;
    const wasLocal = removing.isLocal;
    deleteRule.mutate({ id: removing.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListPricingQueryKey() }); setRemoving(null); notify(wasLocal ? 'Preço local removido; destinos sem regra ficarão sem tarifa.' : 'Regra removida.'); }, onError: (error) => { if (isAuthError(error)) { raiseAuthExpired(); return; } notify('Não foi possível remover esta regra.', 'error'); } });
  };
  return <main className="page-enter">
    <div className="page-heading"><div><div className="eyebrow">TARIFAS · {destinationRules.length.toLocaleString('pt-BR')} DESTINOS</div><h1>Preços</h1><p>Uma tarifa padrão local e valores específicos por destino.</p></div><Button onClick={() => { setFormError(''); setEditing({ id: '', destination: '', price: 0, isLocal: false, createdAt: '' }); }} testId="button-add-price"><Plus size={16} /> Nova regra</Button></div>
    <section className="pricing-intro"><span className="price-illustration"><Tag size={22} /></span><div><div className="eyebrow">TABELA DE TARIFAS</div><h2>Preço previsível, viagem tranquila.</h2><p>Destinos específicos têm prioridade sobre o preço fixo local.</p></div><div className="price-total"><small>DESTINOS CONFIGURADOS</small><b>{destinationRules.length.toString().padStart(2, '0')}</b></div></section>
    {query.isLoading && !query.data ? <div className="price-grid">{Array.from({ length: 4 }, (_, index) => <div className="price-card" key={index}><div className="skeleton sk-line" /><div className="skeleton sk-big" /></div>)}</div> : query.isError && !query.data ? <QueryError onRetry={() => void query.refetch()} /> : <>
      <section className="local-price-panel" data-testid="panel-local-price">
        <div className="local-price-copy"><div className="eyebrow">PREÇO PADRÃO DA CIDADE</div><h2>Preço fixo local</h2><p>Usado quando o destino da corrida não corresponde a nenhuma regra específica da lista.</p>
          {localRule ? <span className="local-price-current"><Check size={13} /> Em vigor: {formatMoney(localRule.price)} por corrida</span> : <span className="local-price-missing">Nenhum preço local cadastrado ainda.</span>}
        </div>
        <form onSubmit={saveLocalPrice} className="local-price-form">
          <label htmlFor="local-price-input">Valor local</label>
          <div className="currency-input"><span>R$</span><input id="local-price-input" name="localPrice" type="number" min="0" step="0.01" defaultValue={localRule?.price ?? ''} required placeholder="0,00" data-testid="input-local-price" /></div>
          {localPriceError && <div className="form-alert" role="alert">{localPriceError}</div>}
          <div className="local-price-actions"><Button type="submit" disabled={upsert.isPending} testId="button-save-local-price">{upsert.isPending ? 'Salvando…' : 'Salvar preço local'}</Button>{localRule && <Button variant="plain" onClick={() => setRemoving(localRule)} testId="button-delete-local-price">Remover</Button>}</div>
        </form>
      </section>
      {destinationRules.length === 0 ?
        <div className="content-panel pricing-empty"><EmptyState title="Ainda não há destinos específicos" text="O preço fixo local será usado até você cadastrar uma tarifa para um destino." action={<Button onClick={() => setEditing({ id: '', destination: '', price: 0, isLocal: false, createdAt: '' })} testId="button-add-first-price"><Plus size={15} /> Adicionar destino</Button>} /></div> :
        <div className="price-grid">{destinationRules.map((rule, index) => <article className="price-card" key={rule.id} data-testid={`card-price-${rule.id}`}>
          <div className="price-card-top"><span className="price-index">{String(index + 1).padStart(2, '0')}</span><div className="row-actions"><IconButton label={`Editar preço de ${rule.destination}`} onClick={() => { setFormError(''); setEditing(rule); }} testId={`button-edit-price-${rule.id}`}><Settings2 size={16} /></IconButton><IconButton label={`Excluir regra de ${rule.destination}`} onClick={() => setRemoving(rule)} testId={`button-delete-price-${rule.id}`}><Trash2 size={16} /></IconButton></div></div>
          <div className="price-place"><MapPin size={15} /><h3 data-testid={`text-price-destination-${rule.id}`}>{rule.destination}</h3></div>
          <div className="price-card-value"><b>{formatMoney(rule.price)}</b><small>por viagem</small></div>
          <div className="price-card-bottom"><span className="destination-badge">Destino específico</span><small>Incluído {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(rule.createdAt))}</small></div>
        </article>)}</div>}
    </>}
    {editing && <Dialog title={editing.id ? 'Editar regra' : 'Nova regra de preço'} subtitle="Configure o preço aplicado a um destino." onClose={() => setEditing(null)}>
      <form onSubmit={save} className="form-stack"><label>Destino<input name="destination" defaultValue={editing.destination} required autoFocus readOnly={Boolean(editing.id)} placeholder="Ex.: Centro, Aeroporto" data-testid="input-price-destination" />{editing.id && <small className="field-hint">O destino identifica a regra; para alterar o preço local, use o cartão acima.</small>}</label>
        <label>Preço por viagem<div className="currency-input"><span>R$</span><input name="price" defaultValue={editing.price || ''} type="number" min="0" step="0.01" required placeholder="0,00" data-testid="input-price-value" /></div></label>
        {formError && <div className="form-alert" role="alert">{formError}</div>}<div className="dialog-actions"><Button variant="secondary" onClick={() => setEditing(null)} testId="button-cancel-price">Cancelar</Button><Button type="submit" disabled={upsert.isPending} testId="button-save-price">{upsert.isPending ? 'Salvando…' : editing.id ? 'Salvar regra' : 'Criar regra'}</Button></div>
      </form>
    </Dialog>}
    {removing && <Dialog title={removing.isLocal ? 'Remover preço local?' : 'Excluir regra?'} subtitle={removing.isLocal ? 'Destinos sem regra específica ficarão sem preço automático.' : `A tarifa para ${removing.destination} será removida.`} onClose={() => setRemoving(null)}><div className="warning-card"><Trash2 size={17} /><span>Essa ação não pode ser desfeita.</span></div><div className="dialog-actions"><Button variant="secondary" onClick={() => setRemoving(null)} testId="button-cancel-delete-price">Cancelar</Button><Button variant="danger" onClick={confirmDelete} disabled={deleteRule.isPending} testId="button-confirm-delete-price">{deleteRule.isPending ? 'Excluindo…' : 'Excluir regra'}</Button></div></Dialog>}
  </main>;
}

function SignIn({ onSignedIn, authNotice }: { onSignedIn: (user: User, token: string) => void; authNotice: string }) {
  const login = useLoginUser();
  const [error, setError] = useState('');
  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    login.mutate({ data: { phone: String(data.get('phone')).trim(), password: String(data.get('password')) } }, {
      onSuccess: (response) => {
        if (response.user.mode !== 'admin') { localStorage.removeItem(TOKEN_KEY); setError('Esta conta não tem acesso à administração.'); return; }
        onSignedIn(response.user, response.token);
      },
      onError: () => setError('Não foi possível entrar. Confira o telefone e a senha e tente novamente.'),
    });
  };
  return <div className="signin-page">
    <div className="signin-brand"><img src={logo} alt="KD TAXI" /><span>ADMINISTRAÇÃO</span></div>
    <div className="signin-art"><div className="art-grid" /><div className="art-circle circle-one" /><div className="art-circle circle-two" /><div className="art-copy"><div className="eyebrow">KD TAXI · CENTRAL DE CONTROLE</div><h1>Uma cidade.<br /><em>Em movimento.</em></h1><p>Operação, pessoas e trajetos. Tudo sob controle, sem perder o ritmo da rua.</p><div className="art-rule"><span /> SISTEMA DE OPERAÇÕES <span className="mono">01 / 04</span></div></div><div className="signin-car"><CarFront size={36} /><span>OPERAÇÃO URBANA</span></div></div>
    <div className="signin-form-wrap"><div className="signin-form-card"><div className="signin-mark"><ShieldCheck size={19} /></div><div className="eyebrow">ÁREA RESTRITA</div><h2>Entrar na administração</h2><p>Acesse com seu telefone e senha cadastrados.</p>
      {(authNotice || error) && <div className="signin-alert" role="alert">{error || authNotice}</div>}
      <form onSubmit={handleLogin} className="form-stack"><label>Telefone<input name="phone" autoComplete="tel" type="tel" required placeholder="(00) 00000-0000" data-testid="input-login-phone" /></label><label>Senha<input name="password" autoComplete="current-password" type="password" required placeholder="Sua senha" data-testid="input-login-password" /></label>
        <Button type="submit" disabled={login.isPending} testId="button-login">{login.isPending ? 'Verificando acesso…' : <>Entrar <ArrowRight size={16} /></>}</Button></form>
      <div className="signin-foot"><span><ShieldCheck size={13} /> Acesso protegido</span><span className="mono">KD TAXI · ADMIN</span></div></div><p className="signin-legal">Somente contas com perfil de administrador podem acessar esta área.</p></div>
  </div>;
}

function AdminShell({ user, onLogout, notify }: { user: User; onLogout: () => void; notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [path, setPath] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const logout = useLogoutUser();
  const logoutNow = () => {
    logout.mutate(undefined, { onSettled: onLogout });
  };
  const links: { href: string; label: string; icon: ReactNode; page: PageName }[] = [
    { href: '/', label: 'Visão geral', icon: <LayoutDashboard size={17} />, page: 'overview' },
    { href: '/users', label: 'Usuários', icon: <UsersRound size={17} />, page: 'users' },
    { href: '/rides', label: 'Corridas', icon: <MapPin size={17} />, page: 'rides' },
    { href: '/pricing', label: 'Preços', icon: <Tag size={17} />, page: 'pricing' },
  ];
  const selected = links.find((link) => link.href === path);
  const pageTitle = selected?.label ?? 'Administração';
  const closeNav = () => setMobileNav(false);
  return <div className="admin-layout">
    {mobileNav && <button className="mobile-scrim" onClick={closeNav} aria-label="Fechar navegação" data-testid="button-close-mobile-nav" />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup"><img src={logo} alt="KD TAXI" /><div><b>KD TAXI</b><span>ADMINISTRAÇÃO</span></div></div>
      <div className="nav-section-label">PAINEL DE CONTROLE</div><nav className="main-nav" aria-label="Navegação principal">
        {links.map((link) => <Link href={link.href} key={link.href} className={`nav-link ${path === link.href ? 'nav-active' : ''}`} onClick={closeNav} data-testid={`link-nav-${link.page}`}>{link.icon}<span>{link.label}</span>{path === link.href && <i />}</Link>)}
      </nav>
      <div className="sidebar-bottom"><div className="service-status"><span className="live-dot" /><div><b>Serviço ativo</b><small>Atualização em tempo real</small></div><span className="mono status-code">OK</span></div>
        <div className="profile-row"><span className="avatar profile-avatar">{initials(user.name)}</span><div className="profile-info"><strong>{user.name}</strong><small>Administrador</small></div><IconButton label="Sair da conta" onClick={logoutNow} testId="button-logout"><LogOut size={16} /></IconButton></div>
      </div>
    </aside>
    <div className="app-main"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir navegação" data-testid="button-open-mobile-nav"><Menu size={20} /></button><div className="breadcrumb"><span>KD TAXI</span><ArrowRight size={13} /><b>{pageTitle}</b></div><div className="topbar-right"><span className="topbar-operator"><span className="live-dot" /> Operação conectada</span><span className="topbar-avatar">{initials(user.name)}</span></div></header>
      <div className="page-container"><Switch>
        <Route path="/" component={() => <Dashboard goRides={() => setPath('/rides')} />} />
        <Route path="/users" component={() => <UserPage notify={notify} />} />
        <Route path="/rides" component={RidesPage} />
        <Route path="/pricing" component={() => <PricingPage notify={notify} />} />
        <Route component={NotFound} />
      </Switch>
        <div className="app-footer"><span>© KD TAXI · Administração</span><span>Operação com clareza.</span></div>
      </div>
    </div>
  </div>;
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const [authNotice, setAuthNotice] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

const [user, setUser] = useState<User | null>(() => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const savedRaw = localStorage.getItem(USER_KEY);
    if (!savedRaw) return null;
    const saved = JSON.parse(savedRaw) as User | null;
    if (saved && saved.mode && saved.mode !== 'admin') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
});

// Restaura sessão se tem token mas sem user (fix CMD+R)
useEffect(() => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && !user) {
    const apiUrl = (import.meta as any).env?.VITE_API_URL || 'https://kdtaxi-api.onrender.com/api';
    fetch(`${apiUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          localStorage.setItem(USER_KEY, JSON.stringify(d.user));
          setUser(d.user);
        }
      })
      .catch(() => {
        // Token inválido, limpa
      });
  }
}, [user]);

const logout = useCallback(() => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    fetch(`${import.meta.env.VITE_API_URL || 'https://kdtaxi-api.onrender.com/api'}/logout`, { 
      method: 'POST', 
      headers: { Authorization: `Bearer ${token}` } 
    }).catch(() => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  setUser(null);
  queryClient.clear();
  setAuthNotice('Sua sessão terminou. Entre novamente para continuar.');
  setLocation('/signin');
}, [queryClient, setLocation]);

  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => setToast({ message, kind }), []);
  useEffect(() => {
    const handleAuthExpired = () => { setAuthNotice('Sua sessão expirou ou não tem permissão. Entre novamente.'); logout(); };
    window.addEventListener('kd-taxi-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('kd-taxi-auth-expired', handleAuthExpired);
  }, [logout]);
  useEffect(() => { if (!user && location !== '/signin') setLocation('/signin'); }, [user, location]);
  const signedIn = (nextUser: User, token: string) => {
    localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(nextUser)); setUser(nextUser); setAuthNotice('');
    queryClient.clear(); setLocation('/');
  };
  if (!user || location === '/signin') {
    return <><SignIn onSignedIn={signedIn} authNotice={authNotice} /><Toast toast={toast} onClose={() => setToast(null)} /></>;
  }
  return <><AdminShell user={user} onLogout={logout} notify={notify} /><Toast toast={toast} onClose={() => setToast(null)} /></>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppContent /></WouterRouter></QueryClientProvider>;
}

export default App;
