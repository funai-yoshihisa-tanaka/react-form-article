import { useState } from 'react';
import { FormWithValidation, EmailInput, PhoneNumberInput, ClearButton } from './components/ValidatedForm'

export default function App() {
  const [email, setEmail] = useState('');
  return (
    <>
      <h1>You did it</h1>
      <FormWithValidation>
        <div>
          <EmailInput name="email" controlledState={[email, setEmail]} />
        </div>
        <div>
          <EmailInput name="email-confirm" syncWith={email} />
        </div>
        <PhoneNumberInput name="phone" />
        <button>test</button>
        <ClearButton>Clear</ClearButton>
      </FormWithValidation>
    </>
  )
}