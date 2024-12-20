'use client'

function UpdateName() {
  function updateName(formData) {
    'use server'
    console.log('name', formData.name)
    return true
  }
  return (
    <form action={updateName}>
      <input type="text" name="name" />
    </form>
  )
}