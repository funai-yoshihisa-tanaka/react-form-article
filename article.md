# `React` で構築する、再利用可能なフォームバリデーションシステム

`React` でフォームを作成する際、バリデーションロジックの実装は常に悩みの種です。
フィールドごとのエラーハンドリング、フォーム全体の送信制御、確認用フィールドの同期...。
これらをコンポーネントの責務として適切に分離し、かつ再利用可能に保つのは簡単ではありません。
この記事では `React Context` を活用した、宣言的で拡張性の高いフォームバリデーションシステムの構築方法を紹介します。

また、バリデーションロジックに `Zod` を採用していますが、深い意味はありません。

## アーキテクチャとディレクトリ構造

このシステムの核心は、責務の明確な分離にあります。まず、コンポーネントがどのように配置されているか、その全体像を見てみましょう。

```
src/
├── components/
│   ├── ValidatedForm/
│   │   ├── inputs/
│   │   │   ├── EmailInput.tsx
│   │   │   ├── InputBase.tsx
│   │   │   ├── PhoneNumberInput.tsx
│   │   │   └── index.tsx
│   │   ├── Form.tsx
│   │   └── index.tsx
│   └── ValidationMessages.tsx
└── App.tsx
```

また、各ファイルの役割は明確に分離されています。

### 1. `src/components/ValidatedForm/Form.tsx` (フォームコンテキスト提供)

フォーム全体のバリデーション状態（入力された値のいずれにも不備が無いかどうかといった状態）を管理します。
`React Context` ( `FormStateContext` と `FormDispatchContext` ) を通じて、
子コンポーネントに「送信ボタンが押されたか( `didTapSubmit` )」をブロードキャストし、
子コンポーネントからは「子コンポーネント自身のバリデーション結果( `setDidPassData` )」を収集します。

### 2. `src/components/ValidatedForm/inputs/InputBase.tsx` (共通入力ロジック)

すべての入力コンポーネントの基盤となる、最も重要なコンポーネントです。
スキーマを受け取り、 `onBlur` 時、または親からの「送信」シグナル ( `didTapSubmit` ) を受け取った時にバリデーションを実行します。
バリデーション結果を `FormDispatchContext` 経由で報告します。

### 3. `inputs/EmailInput.tsx` / `PhoneNumberInput.tsx` (具体的なフィールドのコンポーネント)

`InputBase` をラップし、特定の入力タイプに必要なスキーマや、 `beforeValidate` （バリデーション前の値整形）関数を渡すだけの「薄い」コンポーネントです。
これらは、フォームバリデーションシステムを利用するための具体例であり、
伝えたいことは、 `InputBase` をラップするだけで、複雑な特定の処理を行うフィールドを量産できるということです。

### 4. `src/components/ValidationMessages.tsx` (エラー表示)

`InputBase` から渡されたエラーメッセージの配列を単純に表示する汎用コンポーネントです。

---

## 主要コンポーネントの詳細

### 1. `src/components/ValidatedForm/Form.tsx` - フォームの「司令塔」

`Form` コンポーネントは、`onSubmit` イベントをハンドルする「司令塔」です。
`Context` を「状態配信用( `FormStateContext` )」と「更新関数配信用( `FormDispatchContext` )」の2つに分離し、不要な再レンダリングを抑制しています。

```tsx:src/components/ValidatedForm/Form.tsx
import React, { useEffect } from 'react'

type DidPassData = Record<string, boolean>

// 1. Context を Dispatch (更新) と State (状態) に分離
const FormDispatchContext = React.createContext<React.Dispatch<React.SetStateAction<DidPassData>>>(()=>{});
const FormStateContext = React.createContext<boolean>(false);

// 2. 外部から安全に利用するためのカスタムフック
export function useFormDispatch() {
  return React.useContext(FormDispatchContext);
}
export function useFormState() {
  return React.useContext(FormStateContext);
}

export default function Default({ children, ... }: Props) {
  const [didTapSubmit, setDidTapSubmit] = React.useState(false);
  const [currentEvent, setCurrentEvent] = React.useState<React.FormEvent<HTMLFormElement>|undefined>(undefined);
  const [didPassData, setDidPassData] = React.useState<DidPassData>({});

  // 3. 全ての子コンポーネントのバリデーション結果を監視
  const didPass = React.useMemo(() => {
    if (Object.keys(didPassData).length === 0) return false;
    return Object.values(didPassData).every(v => v);
  }, [didPassData]);

  // フォーム送信の本体ロジック
  const runSubmitLogic = React.useCallback((target: HTMLFormElement, event: React.FormEvent<HTMLFormElement>) => {
    const formDataRecord: Record<string, string> = {}
    // 6. FormData API を使って name 属性から値を取得
    for (const [key, value] of new FormData(target)) {
      if (typeof value == 'string') {
        formDataRecord[key] = value
      }
    }
    // ... (setFormDataRecord, onSubmit 実行)
  }, [onSubmit, setFormDataRecord]);

  const localOnSubmit = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 4. まずバリデーションをトリガー
    setDidTapSubmit(true);

    if (didPass) {
      // 既に通っているなら即時送信
      runSubmitLogic(event.currentTarget, event);
    } else {
      // まだなら、イベントを "送信待ち" として保存
      setCurrentEvent(prev => prev? prev: event);
    }
  }, [didPass, runSubmitLogic]);

  // 5. バリデーション結果(didPass)が変わり、かつ "送信待ち" イベントがあれば送信実行
  useEffect(() => {
    if (didPass && currentEvent) {
      const syntheticEvent: React.FormEvent<HTMLFormElement> = {...currentEvent};
      runSubmitLogic(currentEvent.currentTarget, syntheticEvent);
      setCurrentEvent(undefined);
    }
  }, [didPass, currentEvent, runSubmitLogic]);

  return (
    <form onSubmit={localOnSubmit}>
      <FormDispatchContext.Provider value={setDidPassData}>
        <FormStateContext.Provider value={didTapSubmit}>
          { children }
        </FormStateContext.Provider>
      </FormDispatchContext.Provider>
    </form>
  )
}
```

キーとなるのは `useEffect` を使った送信ロジックです。
`onSubmit` が発生した時点では、まだ子コンポーネントのバリデーションが完了していない可能性があるため、 `didTapSubmit` を `true` にしてバリデーションをトリガーします。
すべての子が `didPassData` を更新し、 `didPass` が `true` になったタイミングで、 `useEffect` が「送信待ち」だった `currentEvent` を使ってフォーム送信を実行します。

ここで、再レンダリングの頻度を考えます。
1文字入力するたびに `Form` や他の入力欄が再レンダリングされては、パフォーマンスが低下します。
このアーキテクチャでは、2つの工夫によってそれを回避しています。

1.  **バリデーションの実行タイミング:**
    1文字ごとの入力( `onChange` )では `InputBase` の内部的な `state` が更新されるだけです。親の `Form` コンポーネントの状態( `didPassData` )を更新するバリデーション( `validate` 関数)が実行されるのは、フォーカスが外れた時( `onBlur` )か、送信ボタンが押された時( `formState` が `true` になった時) のみです。

2.  **Context の分離による最適化:**
    `Form.tsx` では `Context` を「更新関数( `FormDispatchContext` )」と「状態( `FormStateContext` )」に分離しています。 `React` の `Context` の特性上、 `setDidPassData` のような更新関数はコンポーネントの生存期間中、参照が変わりません。
    各 `InputBase` は `FormDispatchContext` からこの変わらない関数を受け取るため、他の入力欄がバリデーションを実行して `Form` の `state` が更新されても、 `FormDispatchContext` を購読しているコンポーネントが再レンダリングされることはありません。

`InputBase` が `FormStateContext` の値( `didTapSubmit` ) の変更によって再レンダリングされるのは、ユーザーが送信ボタンを押した時の1回だけです。

### 2. src/components/ValidatedForm/inputs/InputBase.tsx - バリデーションの「実行役」

このコンポーネントが、本システムの「頭脳」です。 `useFormDispatch` と `useFormState` を使って親の `Form` コンポーネントと通信します。

```tsx:src/components/ValidatedForm/inputs/InputBase.tsx
import { useCallback, useEffect, useId, useMemo, useRef, useState} from'react';
import { useFormDispatch, useFormState } from '../Form';
// ...
export function InputBase({ schema, controlledState, required, ...props }: Props) {
  // 1. 親の Context から更新関数と状態を取得
  const setDidPassData = useFormDispatch();
  const formState = useFormState(); // didTapSubmit の値 (true/false)
  const myId = useId();

  // 2. 親にバリデーション結果を報告する関数をメモ化
  const setDidPass = useCallback((didPass: boolean) => {
    setDidPassData((prev) => {
      // イミュータブルに更新
      return {...prev, [myId]: didPass};
    });
  }, [setDidPassData, myId]);

  const [didValidate, setDidValidate] = useState( false );
  const valueState = useState( defaultValue || '' );
  const [value, _setValue] = controlledState? controlledState: valueState;
  const valueRef = useRef(value);
  const setValue:Dispatch<SetStateAction<string>> = /* ... (valueRefを同期させるロジック) ... */ ;
  const [internalErrorMessage, setInternalErrorMessage] = useState<string[]>([]);

  // ... (localSchema, syncErrorMessage)

  const validate = useCallback(() => {
    setDidValidate(true);
    const value = valueRef.current
    if (validateIfDidPassRequirement(value, required, setDidPass, setInternalErrorMessage)) {
      const targetValue = beforeValidate(value); // 値を整形
      const { error } = localSchema.safeParse(targetValue);
      // ... (エラーハンドリング)
      syncValidation(targetValue, syncWith, syncErrorMessage, setDidPass, setInternalErrorMessage);
      setValue(targetValue); // 整形後の値で state を更新
    }
  }, [ ... ]); // 依存配列

  // 3. アンマウント時に親の state から自身のエントリを削除
  useEffect(() => {
    setDidPass(!required); // 初期状態をセット
    return () => {
      setDidPassData((prev) => {
        const newState = { ...prev };
        delete newState[myId];
        return newState;
      });
    };
  }, [setDidPassData, myId, required, setDidPass]);

  // 4. 親 (Form) から送信が押されたら (formState === true)、
  //    まだバリデーション (onBlur) していなければ、強制的に実行
  useEffect(() => {
    if (formState && !didValidate) {
      validate();
    }
  }, [formState, didValidate, validate]);

  return (
    <div>
      <input
        {...props} // name 属性などもここで渡される
        value={value}
        onChange={(e) => {setValue(e.target.value)}}
        onBlur={validate} // 5. onBlur でバリデーション実行
      />
      <ValidationMessages messages={internalErrorMessage} />
    </div>
  );
}
```

`InputBase` は、`onBlur` による即時検証と、`formState`（送信ボタン押下）による遅延検証の両方をサポートしています。
また、`useEffect` のクリーンアップ関数を利用して、コンポーネントがアンマウントされた際に `Form` コンポーネントの `didPassData` state から自身のIDを削除し、メモリリークや不要なバリデーション結果が残るのを防ぎます。

### 3. src/components/ValidatedForm/inputs/PhoneNumberInput.tsx - 「値の整形」と「スキーマ定義」

`InputBase` の強力さを示す好例が `PhoneNumberInput` です。

```tsx:src/components/ValidatedForm/inputs/PhoneNumberInput.tsx
import zod from 'zod';
import { InputBase, type CommonProps } from "./InputBase";

export function PhoneNumberInput({type, ...props}: EmailInputProps) {
  const schema = zod.string().regex(/^[0-9]+$/, {message: '数値のみ入力してください。'});
  return <InputBase
    schema={schema}
    beforeValidate={(value) => {
      // 1. ハイフンを削除
      // 2. 全角数字を半角に変換
      return value.replaceAll('-', '').replace(/[０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
      });
    }}
    minLength={10}
    maxLength={11}
    {...props}
  />;
}
```

ここでは、 `InputBase` に対して「半角数字のみ」のスキーマと、バリデーション前にハイフンや全角数字を整形する `beforeValidate` 関数を渡しています。
これにより、 `InputBase` 自体は電話番号のフォーマットを一切知る必要がなく、ロジックが完全に分離されています。

なお、この `beforeValidate` の実装により、ユーザーが `090-1234-5678` と入力してフォーカスを外す（`onBlur`）と、`validate` 関数が実行され、入力欄の値が `09012345678` に自動的に書き換わります。
これは、ユーザーにエラーを提示して再入力を強いるのではなく、システム側でデータをクレンジングすることでユーザー体験を向上させ、常に整形されたデータを扱うことを意図したものです。

---

## 実際の使用例 (src/App.tsx)

```tsx:src/App.tsx
import { useState } from 'react';
import { FormWithValidation, EmailInput, PhoneNumberInput } from './components/ValidatedForm'

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
        <button>test</button>
      </FormWithValidation>
    </>
  );
}
```

`App.tsx` では、 `FormWithValidation` コンポーネント（実際には `Form.tsx` をエクスポートしたもの）で各入力コンポーネントをラップしています。
`EmailInput` は `controlledState` を渡して `App` 側の `state` と同期させ、確認用フィールドは `syncWith` プロパティで `email` の値と一致しているか確認しています。
一方、`PhoneNumberInput` は `props` を渡さず、`InputBase` 内部の `state` で動作する非制御コンポーネントとしても利用可能です。

ここで、`name` 属性と `controlledState` が両方利用可能になっているのはなぜか考えます。

`InputBase` は、内部に `value` を持つ `<input>` をレンダリングします。
この `<input>` は、`controlledState` が渡されればその `state` を参照する「制御コンポーネント」として動作し、渡されなければ `InputBase` 内部の `useState` を参照する「非制御コンポーネント」として動作します。

では、`PhoneNumberInput` のように `controlledState` を渡さない非制御コンポーネントの値は、いつどのように収集するのでしょうか。

答えは `Form.tsx` の `runSubmitLogic` 関数にあります。
この関数は、 `new FormData(target)` を使って、フォーム送信時にDOMから値を収集します。
`FormData` API は `<input>` の `name` 属性をキーとして値を収集するため、`controlledState` がなくても、`name="phone"` が指定されていれば値を正しく取得できます。

`controlledState` が必要なのは、今回の `email` と `email-confirm` のように、`syncWith` を使ってコンポーネント間で値をリアルタイムに同期させる（`email` の値を `email-confirm` が知る）必要がある場合などに限定されます。

---

## まとめ

この記事では、`React Context` を用いたフォームバリデーションシステムのアプローチを紹介しました。

* **責務の分離:** `Form` コンポーネントが状態の集約と送信トリガー、 `InputBase` が個別のバリデーション実行と状態報告、具象コンポーネント（ `EmailInput` など）がスキーマと値の整形 という形で、それぞれの役割が明確に分離されています。
* **宣言的な状態管理:** `Context` を使うことで、 `InputBase` は「送信ボタンが押された」という事実 ( `formState` ) を知るだけでよく、フォームの構造や他の入力フィールドの状態を意識する必要がありません。
* **拡張性:** `InputBase` が `beforeValidate` や `syncWith` といった汎用的なインターフェースを提供することで、新しいバリデーションルールや入力形式（例： `PasswordInput` ）の追加が容易になっています。

このアーキテクチャは、フォームの状態管理を一元化しつつ、各入力コンポーネントの再利用性を高める一つの方法です。
