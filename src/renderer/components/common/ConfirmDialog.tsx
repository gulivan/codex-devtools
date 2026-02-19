import { useEffect, useState } from 'react';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean;
}

const DEFAULT_STATE: ConfirmDialogState = {
  isOpen: false,
  title: '',
  message: '',
};

let setGlobalState: ((state: ConfirmDialogState) => void) | null = null;
let resolver: ((result: boolean) => void) | null = null;

export async function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    resolver = resolve;
    setGlobalState?.({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
    });
  });
}

export const ConfirmDialog = (): JSX.Element | null => {
  const [state, setState] = useState<ConfirmDialogState>(DEFAULT_STATE);

  useEffect(() => {
    setGlobalState = setState;

    return () => {
      setGlobalState = null;
    };
  }, []);

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        resolver?.(false);
        resolver = null;
        setState(DEFAULT_STATE);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.isOpen]);

  if (!state.isOpen) {
    return null;
  }

  return (
    <div className="dialog-root" role="dialog" aria-modal="true" aria-label={state.title}>
      <button
        type="button"
        className="dialog-backdrop"
        aria-label="Close dialog"
        onClick={() => {
          resolver?.(false);
          resolver = null;
          setState(DEFAULT_STATE);
        }}
      />

      <div className="dialog-panel">
        <h2 className="dialog-title">{state.title}</h2>
        <p className="dialog-copy">{state.message}</p>

        <div className="dialog-actions">
          <button
            type="button"
            className="tabbar-action"
            onClick={() => {
              resolver?.(false);
              resolver = null;
              setState(DEFAULT_STATE);
            }}
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className="tabbar-action primary"
            onClick={() => {
              resolver?.(true);
              resolver = null;
              setState(DEFAULT_STATE);
            }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
