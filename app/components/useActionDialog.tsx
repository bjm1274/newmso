'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActionDialog, { type ActionDialogInputType, type ActionDialogState, type ActionDialogTone } from './ActionDialog';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ActionDialogTone;
};

type PromptOptions = ConfirmOptions & {
  placeholder?: string;
  initialValue?: string;
  inputType?: ActionDialogInputType;
  required?: boolean;
  maxLength?: number;
  helperText?: string;
};

type Resolver =
  | {
      mode: 'confirm';
      resolve: (value: boolean) => void;
    }
  | {
      mode: 'prompt';
      resolve: (value: string | null) => void;
    };

export function useActionDialog() {
  const [state, setState] = useState<ActionDialogState | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const closeDialog = useCallback((value?: string) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setState(null);

    if (!resolver) return;
    if (resolver.mode === 'confirm') {
      resolver.resolve(Boolean(value));
      return;
    }
    resolver.resolve(value ?? null);
  }, []);

  useEffect(() => {
    return () => {
      const resolver = resolverRef.current;
      resolverRef.current = null;
      if (!resolver) return;
      if (resolver.mode === 'confirm') resolver.resolve(false);
      else resolver.resolve(null);
    };
  }, []);

  const openConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = { mode: 'confirm', resolve };
      setState({
        open: true,
        mode: 'confirm',
        title: options.title,
        description: options.description,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        tone: options.tone,
      });
    });
  }, []);

  const openPrompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = { mode: 'prompt', resolve };
      setState({
        open: true,
        mode: 'prompt',
        title: options.title,
        description: options.description,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        tone: options.tone,
        placeholder: options.placeholder,
        initialValue: options.initialValue,
        inputType: options.inputType,
        required: options.required,
        maxLength: options.maxLength,
        helperText: options.helperText,
      });
    });
  }, []);

  const dialog = useMemo(
    () =>
      state ? (
        <ActionDialog
          {...state}
          onCancel={() => closeDialog(state.mode === 'confirm' ? '' : undefined)}
          onConfirm={(value) => {
            if (state.mode === 'confirm') {
              closeDialog('confirmed');
              return;
            }
            closeDialog(value);
          }}
        />
      ) : null,
    [closeDialog, state]
  );

  return {
    dialog,
    openConfirm,
    openPrompt,
  };
}
