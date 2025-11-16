import React from 'react';
import { useFormClear } from './Form';

type Props = {
  className?: string;
  key?: string;
  children?: React.ReactNode;
}

export function ClearButton({className, children}: Props) {
  const clear = useFormClear();

  return <button type="button" className={className} onClick={clear}>{children}</button>
}