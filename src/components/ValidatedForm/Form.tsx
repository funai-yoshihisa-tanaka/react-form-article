import React, { useEffect } from 'react'

type DidPassData = Record<string, boolean>;
type ClearFuncsRecord = Record<string, () => void>;

type FormDispatchContextType = {
  setDidPassData: React.Dispatch<React.SetStateAction<DidPassData>>;
  setClearFunctions: (id: string, func: () => void) => void;
  removeClearFunctions: (id: string) => void;
  cancelPendingSubmit: ()=>void;
}

const FormDispatchContext = React.createContext<FormDispatchContextType>({setDidPassData: ()=>{}, setClearFunctions: () => {}, removeClearFunctions: () => {}, cancelPendingSubmit: ()=>{}});
const FormClearContext = React.createContext<() => void>(() => {});
const FormStateContext = React.createContext<boolean>(false);

type Props = {
  children?: React.ReactNode;
  method?: string;
  actionPath?: string;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>, formDataRecord: Record<string, string>) => void;
}

// 外部から安全に利用するためのカスタムフック
export function useFormDispatch() {
  return React.useContext(FormDispatchContext);
}
export function useFormClear() {
  return React.useContext(FormClearContext);
}
export function useFormState() {
  return React.useContext(FormStateContext);
}

export function FormWithValidation({ children, onSubmit, method, actionPath }: Props) {
  const [didTapSubmit, setDidTapSubmit] = React.useState(false);
  const [currentEvent, setCurrentEvent] = React.useState<React.FormEvent<HTMLFormElement>|undefined>(undefined);
  const [didPassData, setDidPassData] = React.useState<DidPassData>({});
  const clearFuncsRecordRef = React.useRef<ClearFuncsRecord>({});

  const dispatchContext = React.useMemo(() => {
    return {
      setDidPassData: setDidPassData,
      setClearFunctions: (id: string, func: () => void) => {
        clearFuncsRecordRef.current[id] = func;
      },
      removeClearFunctions: (id: string) => {
        delete clearFuncsRecordRef.current[id];
      },
      cancelPendingSubmit: () => {setCurrentEvent(undefined)},
    }
  }, []);

  const clear = React.useCallback(() => {
    Object.values(clearFuncsRecordRef.current).forEach(clearFunc => clearFunc());
  }, []);

  const didPass = React.useMemo(() => {
    // didPassData が空の場合は false にする (初期状態)
    if (Object.keys(didPassData).length === 0) return false;
    return Object.values(didPassData).every(v => v);
  }, [didPassData]);

    // フォーム送信の本体ロジックを関数として切り出す
  const runSubmitLogic = React.useCallback((target: HTMLFormElement, event: React.FormEvent<HTMLFormElement>) => {
    const formDataRecord: Record<string, string> = {}
    for (const [key, value] of new FormData(target)) {
      if (typeof value == 'string') {
        formDataRecord[key] = value
      }
    }
    if (onSubmit) {
      onSubmit(event, formDataRecord);
    } else {
      target.submit();
    }
    console.log("Form Submitted Successfully");
  }, [onSubmit]);

  const localOnSubmit = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    // 常にネイティブ送信を防止
    event.preventDefault();
    // バリデーションをトリガー
    setDidTapSubmit(true);

    if (didPass) {
      // もし既にバリデーションが通っているなら、即座に送信
      console.log("Submitting immediately (already valid)");
      runSubmitLogic(event.currentTarget, event);
    } else {
      // まだ通っていないなら、イベントを "送信待ち" として保存
      console.log("Validation pending, saving event...");
      setCurrentEvent(prev => prev? prev: event);
    }
  }, [didPass, runSubmitLogic]);

  useEffect(() => {
    if (didPass && currentEvent) {
      runSubmitLogic(currentEvent.currentTarget, currentEvent);
      setCurrentEvent(undefined);
    }
  }, [didPass, currentEvent, runSubmitLogic]);

  return (
    <form onSubmit={localOnSubmit}>
      {/* 4. 2つの Context Provider でラップ */}
      {/* setDidPassData は不変なので、これが原因で子は再レンダリングされない */}
      <FormDispatchContext value={dispatchContext}>
        <FormClearContext value={clear} >
          {/* didTapSubmit が false -> true に変わる時だけ、子が再レンダリングされる */}
          <FormStateContext value={didTapSubmit}>
            { children }
          </FormStateContext>
        </FormClearContext>
      </FormDispatchContext>
    </form>
  )
}