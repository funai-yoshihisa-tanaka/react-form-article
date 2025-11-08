import zod from 'zod';

import { InputBase, type CommonProps } from "./InputBase";

type EmailInputProps = CommonProps

export function EmailInput({type, ...props}: EmailInputProps) {
  // 本来は `zod.email()` を使うべきだが、記事の本質ではないのであえて正規表現を採用。
  const schema = zod.string().regex(/^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, {
    message: 'メールアドレスの形式ではありません。'
  });
  return <InputBase 
    schema={schema}
    type="email"
    {...props}
  />;
}