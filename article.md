# `React` で構築する、再利用可能なフォームバリデーションシステム

`React` でフォームを作成する際、バリデーションロジックの実装は常に悩みの種です。  
フィールドごとのエラーハンドリング、フォーム全体の送信制御、確認用フィールドの同期...。  
これらをコンポーネントの責務として適切に分離し、かつ再利用可能に保つのは簡単ではありません。  
この記事では `React Context` と `useRef` を活用した、宣言的で拡張性が高く、高パフォーマンスなフォームバリデーションシステムの構築方法を紹介します。  
また、バリデーションロジックに `Zod` を採用していますが、深い意味はありません。

## アーキテクチャとディレクトリ構造

このシステムの核心は、責務の明確な分離にあります。まず、コンポーネントがどのように配置されているか、その全体像を見てみましょう。

```src/  
├── components/  
│ ├── ValidatedForm/  
│ │ ├── inputs/  
│ │ │ ├── EmailInput.tsx  
│ │ │ ├── InputBase.tsx  
│ │ │ ├── PhoneNumberInput.tsx  
│ │ │ └── index.tsx  
│ │ ├── ClearButton.tsx  
│ │ ├── Form.tsx  
│ │ └── index.tsx  
│ └── ValidationMessages.tsx  
└── App.tsx  
```  
各ファイルの役割は明確に分離されています。

1. `Form.tsx` (フォームコンテキスト提供):  
  フォーム全体の「状態」と「更新関数」を管理する司令塔です。 `Context` を通じて、子コンポーネントに「送信が押されたか」( `FormStateContext` )、バリデーション結果や各種関数を登録するための「更新関数群」( `FormDispatchContext` )、そして「リセット関数」( `FormClearContext` ) を提供します。  
2. `InputBase.tsx` (共通入力ロジック):  
  すべての入力コンポーネントの基盤です。 `onBlur` や「送信」シグナルでバリデーションを実行し、 `FormDispatchContext` 経由で結果を親に報告します。また、マウント時に自身のリセット関数やバリデーション結果を親に"登録"し、 `onFocus` 時に親の「保留中送信」をキャンセルするなど、高度な連携を行います。  
3. `ClearButton.tsx` (リセットトリガー):  
  `FormClearContext` から「リセット関数」を受け取り、 `onClick` で実行するだけのシンプルなコンポーネントです。  
4. `EmailInput.tsx` / `PhoneNumberInput.tsx` (具象コンポーネント):  
  `InputBase` をラップし、特定の入力タイプに必要なスキーマや、 `beforeValidate` （バリデーション前の値整形）関数を渡す「薄い」コンポーネントです。
  このコンポーネントについて本記事で伝えたいことは、 `InputBase` をラップするだけで、複雑な特定の処理を行うフィールドを量産できるということです。

## 主要コンポーネントの詳細

### 1. src/components/ValidatedForm/Form.tsx - フォームの「司令塔」

`Form` コンポーネントは、 `onSubmit` イベントのハンドリング、子コンポーネントからの状態収集、そしてリセット機能の提供という3つの主要な責務を持ちます。

```tsx:src/components/ValidatedForm/Form.tsx  
import React, { useEffect } from 'react'  
type DidPassData = Record<string, boolean>;  
type ClearFuncsRecord = Record<string, () => void>;  
type FormDispatchContextType = {  
  setDidPassData: React.Dispatch<React.SetStateAction<DidPassData>>;  
  setClearFunctions: (id: string, func: () => void) => void;  
  removeClearFunctions: (id: string) => void;  
  cancelPendingSubmit: ()=>void;  
}  
// 1. Context を責務ごとに3つに分離  
const FormDispatchContext = React.createContext<FormDispatchContextType>({
  setDidPassData: ()=>{},
  setClearFunctions: () => {},
  removeClearFunctions: () => {},
  cancelPendingSubmit: ()=>{},
});  
const FormClearContext = React.createContext<() => void>(() => {});  
const FormStateContext = React.createContext<boolean>(false);  
type Props = { /* ... */ }

// 2. 外部から安全に利用するためのカスタムフック  
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
  // 3. リセット関数を useState ではなく useRef で管理  
  const clearFuncsRecordRef = React.useRef<ClearFuncsRecord>({});  
  // 4. Dispatch Context に渡す value を useMemo でメモ化  
  const dispatchContext = React.useMemo(() => {  
    return {  
      setDidPassData: setDidPassData,  
      setClearFunctions: (id: string, func: () => void) => {  
        clearFuncsRecordRef.current[id] = func;  
      },  
      removeClearFunctions: (id: string) => {  
        delete clearFuncsRecordRef.current[id];  
      },  
      cancelPendingSubmit: () => {setCurrentEvent(undefined)}, // 5. 保留中の送信をキャンセルする関数  
    }  
  }, []);  
  // 6. Clear Context に渡すリセット実行関数  
  const clear = React.useCallback(() => {  
    Object.values(clearFuncsRecordRef.current).forEach(clearFunc => clearFunc());  
  }, []);  
  const didPass = React.useMemo(() => {  
  if (Object.keys(didPassData).length === 0) return false;  
    return Object.values(didPassData).every(v => v);  
  }, [didPassData]);  
  // ... (runSubmitLogic, localOnSubmit, useEffect) ...  
  // localOnSubmit や useEffect のロジックは前回と同様  
  return (  
    <form onSubmit={localOnSubmit}>  
      {/* 7. 責務分離された3つの Context Provider でラップ */}  
      <FormDispatchContext value={dispatchContext}>  
        <FormClearContext value={clear} >  
          <FormStateContext value={didTapSubmit}>  
          { children }  
          </FormStateContext>  
        </FormClearContext>  
      </FormDispatchContext>  
    </form>  
  )  
}  
```  
このコンポーネントの設計は、パフォーマンスと堅牢性を両立させています。

* **コールバック・レジストリ・パターン:** リセット関数を `useState` で管理すると、 `InputBase` がマウントされるたびに `Form` が再レンダリングされます。 `useRef` を使うことで、再レンダリングを一切発生させずに、子からの関数登録・解除（ `setClearFunctions` など）を可能にしています。  
* **Context の分離:** `Context` を `Dispatch` , `Clear` , `State` の3つに分離し、 `dispatchContext` を `useMemo` でメモ化しています。これにより、 `didPassData` (バリデーション状態) が更新されても、 `dispatchContext` の参照は変わらないため、 `InputBase` 側の不要な再レンダリング（パフォーマンス低下）を回避しています。

### 2. src/components/ValidatedForm/inputs/InputBase.tsx - 高機能な「実行役

`InputBase` は `Form` の司令塔と密に連携し、自身の状態を管理・報告します。

```tsx:src/components/ValidatedForm/inputs/InputBase.tsx  
import { useCallback, useEffect, useId, useMemo, useRef, useState} from'react';  
// ...  
import { useFormDispatch, useFormState } from "../Form";  
// ...  
export function InputBase({ schema, controlledState, required, ...props }: Props) {  
  // 1. 親の Context から必要な関数をすべて受け取る  
  const { setDidPassData, setClearFunctions, removeClearFunctions, cancelPendingSubmit } = useFormDispatch();  
  const formState = useFormState();  
  const myId = useId();  
  // ... (useState, valueRef, setValue, validate などのロジック) ...

  const setDidPass = useCallback((didPass: boolean) => {  
    setDidPassData((prev) => {  
      return {...prev, [myId]: didPass};  
    });  
  }, [setDidPassData, myId]);  
  // 2. マウント・アンマウント時の処理  
  useEffect(() => {  
    // 自身の初期状態とリセット関数を親に"登録"  
    setDidPass(!required);  
    setClearFunctions(myId, () => {  
      setValue('');  
      setInternalErrorMessage([]);  
      setDidPass(!required)  
    });  
    // アンマウント時に実行されるクリーンアップ関数  
    return () => {  
      // 親の State から自身のバリデーション結果とリセット関数を"登録解除"  
      setDidPassData((prev) => {  
        const newState = { ...prev };  
        delete newState[myId];  
        return newState;  
      });  
      removeClearFunctions(myId);  
    };
  }, [setDidPassData, setClearFunctions, removeClearFunctions, myId, required, setValue, setDidPass, setInternalErrorMessage]);

  // ... (validate, syncWith の useEffect) ...

  // 送信シグナルを受けた時の処理  
  useEffect(() => {  
    if (formState && !didValidate) {  
      validate();  
    }  
  }, [formState, didValidate, validate]);  
  return (  
    <div>  
      <input  
        {...props}  
        // 3. フォーカス時に「保留中の送信」をキャンセル  
        onFocus={() => {cancelPendingSubmit()}}  
        value={value}  
        onChange={(e) => {setValue(e.target.value)}}  
        onBlur={validate}  
      />  
      <ValidationMessages messages={internalErrorMessage} />  
    </div>  
  );  
}  
```  
`InputBase` の `useEffect` 内のクリーンアップ関数 [cite: `InputBase.tsx` ] が、Form の `clearFuncsRecordRef` [cite: `Form.tsx` ] から自身の関数を削除するため、コンポーネントが動的に（例えば条件分岐で）アンマウントされても、メモリリークや不要な関数呼び出しが防がれます。

また、 `onFocus` で `cancelPendingSubmit()` を呼び出す [cite: `InputBase.tsx` ] ことで、  
「バリデーション失敗 → エラーを修正 → `didPass` が `true` になる → ボタンを押していないのに自動送信される」  
という厄介なバグを、宣言的に解決しています。

### **3. src/components/ValidatedForm/ClearButton.tsx - 安全なリセットトリガー**

`ClearButton` は、 `FormClearContext` を通じて `clear` 関数を受け取るだけのシンプルなコンポーネントです。

```tsx:src/components/ValidatedForm/ClearButton.tsx  
import React from 'react';  
import { useFormClear } from './Form';  
type Props = { /* ... */ }

export function ClearButton({className, children}: Props) {  
const clear = useFormClear();  
  // 1. type="button" を指定する  
  return <button type="button" className={className} onClick={clear}>{children}</button>  
}  
```  
ここで最も重要なのは、 `type="button"` を明示的に指定している点です。

もし `type="reset"` を使用すると、 `onClick` による `React` の `State` 更新（ `setValue('')` など）と、 `HTML` ネイティブの `reset` 動作（DOM を `defaultValue` に戻す）が競合し、 `React` の `State` と DOM の値が不整合を起こすバグの原因となります。  
`type="button"` にすることで、ネイティブ動作を無効化し、状態管理を 100% `React` の制御下に置くことができます。

## **🚀 実際の使用例 (src/App.tsx)**

これらのコンポーネントを組み合わせて使用する例です。

```tsx:src/App.tsx  
import { useState } from 'react';  
import { FormWithValidation, EmailInput, PhoneNumberInput, ClearButton } from './components/ValidatedForm'  
export default function App() {  
  const [email, setEmail] = useState('');  
  return (  
    <>  
      <h1>You did it</h1>  
      <FormWithValidation>  
        <div>  
          {/* 制御コンポーネントとして */}  
          <EmailInput name="email" controlledState={[email, setEmail]} />  
        </div>  
        <div>  
          {/* 別の state と値を同期させるバリデーション */}  
          <EmailInput name="email-confirm" syncWith={email} />  
        </div>  
        <div>  
        {/* 非制御コンポーネントとして (name属性が重要) */}  
        <PhoneNumberInput name="phone" />  
        </div>  
        {/* ボタンエリア */}  
        <div>  
          <ClearButton>リセット</ClearButton>  
          <button type="submit">送信</button>  
        </div>  
      </FormWithValidation>  
    </>
  );  
}  
```  
ここで、 `name` 属性と `controlledState` が両方利用可能になっているのはなぜか考えます。

`InputBase` は、 `controlledState` が渡されればその `state` を参照する「制御コンポーネント」として動作し、渡されなければ内部の `useState` を参照する「非制御コンポーネント」として動作します。

では、 `PhoneNumberInput` のように `controlledState` を渡さない非制御コンポーネントの値は、いつどのように収集するのでしょうか。

答えは `Form.tsx` の `runSubmitLogic` 関数にあります。この関数は、`new FormData(target)` を使って、フォーム送信時にDOMから値を収集します [cite: `Form.tsx` ]。FormData API は `<input>` の `name` 属性をキーとして値を収集するため、 `controlledState` がなくても、 `name="phone"` が指定されていれば値を正しく取得できます。

`controlledState` が必要なのは、今回の `email` と `email-confirm` のように、 `syncWith` を使ってコンポーネント間で値をリアルタイムに同期させる（ `email` の値を `email-confirm` が知る）必要がある場合などに限定されます。

## まとめ

この記事では、 `React Context` と `useRef` を用いた高度なフォームバリデーションシステムのアプローチを紹介しました。

* **責務の分離:** `Form` が「仲介役・司令塔」、 `InputBase` が「実行役・登録役」、 `ClearButton` が「トリガー役」として、それぞれの役割が明確に分離されています。  
* **宣言的な状態管理:** `useRef` を使った「コールバック・レジストリ・パターン」により、再レンダリングを発生させずに、子から親へ宣言的に関数を登録・解除します。  
* **堅牢なバグ修正:** `onFocus` による「保留中送信のキャンセル」や、 `type="button"` による「リセット動作の競合回避」など、 `React` 特有の落とし穴をふさぐ堅牢な設計になっています。
