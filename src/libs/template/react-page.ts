import * as Cst from '../constant'

export const reactPage = (consts: string) =>
  `import React, { useState } from 'react'
import logo from './logo.svg'
import './App.css'
import { ${consts} } from './${Cst.DefaultClientApiDir}'

function App() {
  const [state, setState] = useState('init')
  async function click() {
    const rtn = await Blog.user.insert({
      data: {
        firstName: 'aa',
        lastName: 'bb',
      },
    })
    setState(JSON.stringify(rtn))
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <p>{state}</p>
        <button onClick={click}>点击</button>
      </header>
    </div>
  )
}

export default App
`
