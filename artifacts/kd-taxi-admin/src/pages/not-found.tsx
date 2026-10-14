import { ArrowLeft, CircleHelp } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return <main className="not-found-page">
    <div className="not-found-code mono">ERRO 404 <span>·</span> ROTA INDISPONÍVEL</div>
    <div className="not-found-icon"><CircleHelp size={24} /></div>
    <h1>Este caminho não está no mapa.</h1>
    <p>A página que você procura não existe ou foi movida. Volte ao painel e continue de onde a operação acontece.</p>
    <Link href="/" className="not-found-link" data-testid="link-not-found-home"><ArrowLeft size={15} /> Voltar à visão geral</Link>
    <span className="not-found-brand">KD TAXI <i /> ADMINISTRAÇÃO</span>
  </main>;
}
