type Props = {
  messages: string[];
}

export default function ValidationMessages({ messages }: Props) {
  return (
    <div style={{width: 'fit-content'}}>
      {/* 本来は `key={index}` はReactのアンチパターンだが、記事の本質ではないうえ対処が面倒なので採用 */}
      {messages.map((message, index) => {
        return <p key={index}>{message}</p>
      })}
    </div>
  )
}