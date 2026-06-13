import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MCM] Erro de renderização capturado:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md w-full space-y-5 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="font-display font-bold text-xl text-foreground">
              Algo deu errado
            </h1>
            <p className="text-sm text-muted-foreground">
              O MCM encontrou um erro inesperado nesta tela. Seus dados estão seguros.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-left">
            <p className="text-xs font-mono text-muted-foreground break-all">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}
