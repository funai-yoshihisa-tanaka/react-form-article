import { useCallback, useEffect, useId, useMemo, useRef, useState} from'react';
import type { Dispatch, HTMLInputTypeAttribute, SetStateAction } from "react";
import { useFormDispatch, useFormState } from "../Form";
import zod from "zod";
import ValidationMessages from "../../ValidationMessages";

const DEFAULT_MAX_LENGTH = 256;

export type CommonProps = {
  type?: HTMLInputTypeAttribute;
  name?: string;
  className?: string;
  key?: string;
  controlledState?: [string, Dispatch<SetStateAction<string>>]
  defaultValue?: string;
  required?: boolean;
  syncWith?: string;
  beforeValidate?: (value: string) => string;
}

type Props = {
  schema: zod.ZodString;
  minLength?: number;
  maxLength?: number;
} & CommonProps;

function validateIfDidPassRequirement(
  value: string,
  isRequired: boolean|undefined,
  setDidPass: (didPass: boolean) => void,
  setInternalErrorMessage: Dispatch<SetStateAction<string[]>>,
) {
  if (value === '') {
    if (isRequired) {
      setDidPass(false);
      setInternalErrorMessage(['required']);
      return false;
    }
    setInternalErrorMessage([]);
    return undefined;
  }
  setInternalErrorMessage([]);
  return true;
}

function syncValidation(
  value: string,
  syncWith: string|undefined,
  syncErrorMessage: string,
  setDidPass: (didPass: boolean) => void,
  setInternalErrorMessage: Dispatch<SetStateAction<string[]>>,
) {
  if ( syncWith ) {
    if ( value !== syncWith ) {
      setDidPass(false);
      setInternalErrorMessage(messages => messages.includes(syncErrorMessage) ? messages : [syncErrorMessage, ...messages]);
      return;
    }
  }
  setDidPass(true);
  setInternalErrorMessage([]);
}

export function InputBase({ schema, controlledState, required, defaultValue, syncWith, minLength = 0, maxLength = DEFAULT_MAX_LENGTH, beforeValidate = (v) => v, ...props }: Props) {
  const setDidPassData = useFormDispatch();
  const formState = useFormState();
  const myId = useId();
  const setDidPass = useCallback((didPass: boolean) => {
    setDidPassData((prev) => {
      return {...prev, [myId]: didPass};
    });
  }, [setDidPassData, myId]);

  const [didValidate, setDidValidate] = useState( false );
  const valueState = useState( defaultValue || '' );
  const [value, _setValue] = controlledState? controlledState: valueState;
  const valueRef = useRef(value);
  const setValue:Dispatch<SetStateAction<string>> = useCallback((action) => {
    _setValue(currentVal => {
      const result = typeof action === 'function'? action(currentVal) : action;
      valueRef.current = result;
      return result;
    })
    const result = typeof action === 'function'? action(value) : action;
    valueRef.current = result;
    _setValue(result);
  }, [_setValue]);
  const [internalErrorMessage, setInternalErrorMessage] = useState<string[]>([]);

  const syncErrorMessage = 'Sync Error.'

  const localSchema = useMemo(() => {
    return schema.min(minLength, {message: `${minLength}以上の文字数が必要です。`}).max(maxLength, {message: `${maxLength}文字以内で入力してください。`})
  }, [schema, minLength, maxLength]);

  const validate = useCallback(() => {
    setDidValidate(true);
    const value = valueRef.current
    if (validateIfDidPassRequirement(value, required, setDidPass, setInternalErrorMessage)) {
      const targetValue = beforeValidate(value);
      const { error } = localSchema.safeParse(targetValue);
      if ( error ) {
        setDidPass(false);
        setInternalErrorMessage(error.issues.map(issue => issue.message));
        return
      }
      syncValidation(targetValue, syncWith, syncErrorMessage, setDidPass, setInternalErrorMessage);
      setValue(targetValue);
    }
  }, [
    setValue,
    required, 
    setDidPass, 
    setInternalErrorMessage, 
    beforeValidate, 
    localSchema, 
    syncWith, 
    syncErrorMessage,
  ]);

  useEffect(() => {
    setDidPass(!required);

    // アンマウント時に実行されるクリーンアップ関数
    return () => {
      setDidPassData((prev) => {
        const newState = { ...prev };
        delete newState[myId];
        return newState;
      });
    };
  }, [setDidPassData, myId, required, setDidPass]);

  useEffect(() => {
    if (valueRef.current !== '') {
      syncValidation(valueRef.current, syncWith, syncErrorMessage, setDidPass, setInternalErrorMessage);
    }
  }, [syncWith, syncErrorMessage, setDidPass, setInternalErrorMessage]);

  useEffect(() => {
    if (formState && !didValidate) {
      validate();
    }
  }, [formState, didValidate, validate]);

  return (
    <div>
      <input
        {...props}
        value={value}
        onChange={(e) => {setValue(e.target.value)}}
        onBlur={validate}
      />
      <ValidationMessages messages={internalErrorMessage} />
    </div>
  );
}