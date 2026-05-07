import { useCallback, useState } from 'react';

export function useFormModal<T>(initialValues: T) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<T>(initialValues);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const reset = useCallback(() => {
    setForm(initialValues);
    setIsOpen(false);
  }, [initialValues]);

  return { isOpen, setIsOpen, form, setForm, open, close, toggle, reset };
}
