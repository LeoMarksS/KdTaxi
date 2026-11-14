import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
interface Settings {
  enabled: boolean;
  start: string;
  end: string;
  timeZone: string;
  carPrice: number;
  motorcyclePrice: number;
}
const key = ["/api/admin/night-fares"];
const base =
  import.meta.env.VITE_API_URL || "https://kdtaxi-api.onrender.com/api";
async function request(method = "GET", body?: Settings): Promise<Settings> {
  const res = await fetch(`${base}/admin/night-fares`, {
    method,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("kd-taxi-admin-token") ?? ""}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(
      new Error(data.error || "Não foi possível atualizar a tarifa."),
      { status: res.status },
    );
  return data;
}
export default function NightFares({
  notify,
}: {
  notify: (message: string, kind?: "success" | "error") => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => request(),
    refetchInterval: 60_000,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const data: Settings = {
      enabled: form.get("enabled") === "on",
      start: String(form.get("start")),
      end: String(form.get("end")),
      timeZone: String(form.get("timeZone")).trim(),
      carPrice: Number(form.get("carPrice")),
      motorcyclePrice: Number(form.get("motorcyclePrice")),
    };
    setSaving(true);
    try {
      const saved = await request("PUT", data);
      client.setQueryData(key, saved);
      notify("Configuração da tarifa noturna salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };
  const s = query.data;
  return (
    <section className="local-price-panel" data-testid="panel-night-fares">
      <div className="local-price-copy">
        <div className="eyebrow">TARIFA POR HORÁRIO</div>
        <h2>Tarifa noturna local</h2>
        <p>
          O horário do pedido define o preço. Depois de solicitada, a corrida
          mantém o valor mesmo que o motorista aceite em outro horário.
        </p>
        <p>
          Fora do período noturno, vale o preço fixo local. Destinos específicos
          mantêm suas próprias tarifas.
        </p>
        {s && (
          <span className="local-price-current">
            {s.enabled
              ? `Ativa: ${s.start} até ${s.end}`
              : "Desativada: usando a tabela habitual"}
          </span>
        )}
      </div>
      {query.isLoading ? (
        <p>Carregando configuração…</p>
      ) : !s ? (
        <div>
          <p role="alert">Não foi possível carregar a tarifa noturna.</p>
          <button onClick={() => void query.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        <form
          key={JSON.stringify(s)}
          className="local-price-form"
          onSubmit={save}
        >
          <label>
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} />{" "}
            Ativar tarifa noturna local
          </label>
          <label>
            Início
            <input name="start" type="time" defaultValue={s.start} required />
          </label>
          <label>
            Voltar à tarifa diurna
            <input name="end" type="time" defaultValue={s.end} required />
          </label>
          <label>
            Fuso horário
            <input
              name="timeZone"
              defaultValue={s.timeZone}
              required
              maxLength={80}
              placeholder="America/Recife"
            />
          </label>
          <label>
            Táxi à noite (R$)
            <input
              name="carPrice"
              type="number"
              min="0"
              max="9999999.99"
              step="0.01"
              defaultValue={s.carPrice}
              required
            />
          </label>
          <label>
            Mototáxi à noite (R$)
            <input
              name="motorcyclePrice"
              type="number"
              min="0"
              max="9999999.99"
              step="0.01"
              defaultValue={s.motorcyclePrice}
              required
            />
          </label>
          <small>
            O início está incluído; o horário de retorno já usa a tarifa diurna.
            A taxa da plataforma, quando ativa, é acrescentada depois.
          </small>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <div className="local-price-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? "Salvando…" : "Salvar tarifa noturna"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
