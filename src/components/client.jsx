'use client'

import { useState } from 'react'

export default function Foobar({ foobar }) {
  const [msg, setMsg] = useState('Not clicked')
  function onClick () {
    setMsg('Clicked')
  }
  return (
    <>
      <p>From client component: {foobar}</p>
      <p onClick={onClick}>{msg}</p>
    </>
  )
}
