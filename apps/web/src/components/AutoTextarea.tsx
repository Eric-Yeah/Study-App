import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** Textfeld, das mit dem Inhalt wächst (höchstens 14 Zeilen, danach scrollt es). */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 340)}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}
