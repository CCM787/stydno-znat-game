import { useRef, useState } from 'react';

// Общий тост-хелпер: host/builder/login показывают одну и ту же всплывашку внизу экрана.
export function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = (text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 1800);
  };

  return { toastMessage: message, toast };
}
