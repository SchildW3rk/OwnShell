import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@ownshell/ui';

interface AppErrorBoundaryState {
  error: Error | null;
}

const getCopy = () => {
  const isGerman = navigator.language.toLowerCase().startsWith('de');

  if (isGerman) {
    return {
      title: 'OwnShell konnte die Oberfläche nicht laden',
      description:
        'Der App-Prozess läuft noch, aber die Oberfläche ist in einen Fehlerzustand geraten.',
      support: 'Wenn das wiederholt passiert, schick bitte einen kurzen Hinweis an',
      reload: 'Neu laden',
    };
  }

  return {
    title: 'OwnShell could not load the interface',
    description: 'The app process is still running, but the interface hit an error state.',
    support: 'If this keeps happening, send a short note to',
    reload: 'Reload',
  };
};

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Renderer error boundary caught an error', error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const copy = getCopy();

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-warning/30 bg-warning/10">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            {copy.support}{' '}
            <a
              href="mailto:support@ownshell.app?subject=OwnShell%20Bug%20Report"
              className="font-medium text-primary hover:text-primary/80"
            >
              support@ownshell.app
            </a>
          </p>
          <Button onClick={this.reload} variant="primary" className="mt-5 no-drag">
            <RefreshCw className="mr-2 h-4 w-4" />
            {copy.reload}
          </Button>
        </div>
      </div>
    );
  }
}
