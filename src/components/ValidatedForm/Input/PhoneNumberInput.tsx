import zod from 'zod';

import { InputBase, type CommonProps } from "./InputBase";

type EmailInputProps = CommonProps

export function PhoneNumberInput({type, ...props}: EmailInputProps) {
  const schema = zod.string().regex(/^[0-9]+$/, {
    message: '数値のみ入力してください。'
  });
  return <InputBase 
    schema={schema}
    beforeValidate={(value) => {
      return value.replaceAll('-', '').replace(/[０-９]/g, function(s) {
        // マッチした全角数字のUnicodeコードポイントから
        // 全角と半角の差分 (0xFEE0 または 65248) を引く
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
      })
    }}
    minLength={10}
    maxLength={11}
    {...props}
  />;
}